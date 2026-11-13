//! Contrato entre la app de Lenz y `lenz-daemon`.
//!
//! Cada frame en el pipe/socket es: longitud `u32` big-endian + payload MessagePack (ver [`frame`]).
//! Si cambias cualquier tipo de este archivo, sube [`PROTOCOL_VERSION`].

pub mod frame;
pub mod paths;
pub mod transport;

use serde::{Deserialize, Serialize};

/// Versión del protocolo. Se compara en el handshake; si no coincide, la app reinicia el daemon.
pub const PROTOCOL_VERSION: u32 = 1;

/// Identificador de una sesión de terminal administrada por el daemon.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SessionId(pub String);

impl std::fmt::Display for SessionId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// Estado público de una sesión. También se envía tal cual a la UI (JSON en camelCase).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: SessionId,
    pub title: String,
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
    pub exited: bool,
    pub exit_code: Option<i32>,
}

/// Mensaje app → daemon. `id` se repite en la [`Response`] correspondiente.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClientMessage {
    pub id: u64,
    pub request: Request,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Request {
    Hello {
        protocol_version: u32,
    },
    ListSessions,
    /// `cwd` y `command` vacíos = shell por defecto en la carpeta del usuario.
    CreateSession {
        cwd: Option<String>,
        command: Option<Vec<String>>,
        cols: u16,
        rows: u16,
    },
    WriteInput {
        session: SessionId,
        #[serde(with = "serde_bytes")]
        bytes: Vec<u8>,
    },
    Resize {
        session: SessionId,
        cols: u16,
        rows: u16,
    },
    /// Empieza a recibir eventos de la sesión. El primero siempre es [`Event::Snapshot`].
    Subscribe {
        session: SessionId,
    },
    Unsubscribe {
        session: SessionId,
    },
    /// Mata el proceso y elimina la sesión.
    CloseSession {
        session: SessionId,
    },
    /// Apaga el daemon (y todas sus sesiones).
    Shutdown,
}

/// Mensaje daemon → app.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ServerMessage {
    Response { id: u64, response: Response },
    Event(Event),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Response {
    Hello {
        protocol_version: u32,
        daemon_version: String,
        /// Identifica el binario que está corriendo; si no coincide con el de la app, se reinicia.
        build_id: String,
    },
    Session(SessionInfo),
    Sessions(Vec<SessionInfo>),
    Ok,
    Error {
        message: String,
    },
}

/// Eventos que el daemon emite a los clientes suscritos a una sesión.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Event {
    /// Contenido completo del scrollback. La UI debe limpiar la terminal antes de escribirlo.
    Snapshot {
        session: SessionId,
        #[serde(with = "serde_bytes")]
        bytes: Vec<u8>,
    },
    /// Salida nueva del PTY, agrupada.
    Output {
        session: SessionId,
        #[serde(with = "serde_bytes")]
        bytes: Vec<u8>,
    },
    Exited {
        session: SessionId,
        exit_code: Option<i32>,
    },
}

#[derive(Debug, thiserror::Error)]
pub enum CodecError {
    #[error("no se pudo serializar: {0}")]
    Encode(#[from] rmp_serde::encode::Error),
    #[error("no se pudo deserializar: {0}")]
    Decode(#[from] rmp_serde::decode::Error),
}

/// Serializa un mensaje a MessagePack (sin el prefijo de longitud).
pub fn encode<T: Serialize>(msg: &T) -> Result<Vec<u8>, CodecError> {
    Ok(rmp_serde::to_vec_named(msg)?)
}

/// Deserializa un mensaje desde MessagePack (sin el prefijo de longitud).
pub fn decode<'a, T: Deserialize<'a>>(bytes: &'a [u8]) -> Result<T, CodecError> {
    Ok(rmp_serde::from_slice(bytes)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_message_roundtrip() {
        let msg = ClientMessage {
            id: 7,
            request: Request::WriteInput {
                session: SessionId("s1".into()),
                bytes: b"ls\r".to_vec(),
            },
        };
        let bytes = encode(&msg).unwrap();
        assert_eq!(decode::<ClientMessage>(&bytes).unwrap(), msg);
    }

    #[test]
    fn server_event_roundtrip() {
        let msg = ServerMessage::Event(Event::Output {
            session: SessionId("s1".into()),
            bytes: vec![0x1b, b'[', b'm', 0xff],
        });
        let bytes = encode(&msg).unwrap();
        assert_eq!(decode::<ServerMessage>(&bytes).unwrap(), msg);
    }
}
