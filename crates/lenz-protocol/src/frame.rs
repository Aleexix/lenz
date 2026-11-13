//! Frames: `u32` big-endian con la longitud + payload MessagePack.

use serde::{de::DeserializeOwned, Serialize};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use crate::{decode, encode, CodecError};

/// Tamaño máximo de un frame. Protege contra datos corruptos.
pub const MAX_FRAME: usize = 16 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum FrameError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Codec(#[from] CodecError),
    #[error("frame demasiado grande ({0} bytes)")]
    TooLarge(usize),
}

pub async fn write_frame<W, T>(writer: &mut W, msg: &T) -> Result<(), FrameError>
where
    W: AsyncWrite + Unpin,
    T: Serialize,
{
    let payload = encode(msg)?;
    if payload.len() > MAX_FRAME {
        return Err(FrameError::TooLarge(payload.len()));
    }
    let mut buf = Vec::with_capacity(4 + payload.len());
    buf.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    buf.extend_from_slice(&payload);
    writer.write_all(&buf).await?;
    writer.flush().await?;
    Ok(())
}

/// Lee un frame. Devuelve `Ok(None)` si el otro lado cerró la conexión limpiamente.
pub async fn read_frame<R, T>(reader: &mut R) -> Result<Option<T>, FrameError>
where
    R: AsyncRead + Unpin,
    T: DeserializeOwned,
{
    let mut len = [0u8; 4];
    match reader.read_exact(&mut len).await {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e.into()),
    }
    let len = u32::from_be_bytes(len) as usize;
    if len > MAX_FRAME {
        return Err(FrameError::TooLarge(len));
    }
    let mut payload = vec![0u8; len];
    reader.read_exact(&mut payload).await?;
    Ok(Some(decode(&payload)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ClientMessage, Request};

    #[tokio::test]
    async fn frame_roundtrip() {
        let (mut a, mut b) = tokio::io::duplex(1024);
        let msg = ClientMessage {
            id: 1,
            request: Request::ListSessions,
        };
        write_frame(&mut a, &msg).await.unwrap();
        drop(a);
        let got: Option<ClientMessage> = read_frame(&mut b).await.unwrap();
        assert_eq!(got, Some(msg));
        let eof: Option<ClientMessage> = read_frame(&mut b).await.unwrap();
        assert_eq!(eof, None);
    }
}
