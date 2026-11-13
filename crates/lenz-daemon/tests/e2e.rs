//! Prueba de punta a punta: lanza el binario real del daemon con un endpoint propio,
//! crea una sesión, lee su salida, se desconecta y verifica que la sesión sobrevive.

use std::{
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

use lenz_protocol::{
    frame, paths, transport, ClientMessage, Event, Request, Response, ServerMessage, SessionInfo,
};
use tokio::io::{ReadHalf, WriteHalf};

const TIMEOUT: Duration = Duration::from_secs(20);

struct Client {
    rd: ReadHalf<transport::Stream>,
    wr: WriteHalf<transport::Stream>,
    next_id: u64,
}

impl Client {
    async fn connect() -> Self {
        let deadline = Instant::now() + TIMEOUT;
        loop {
            match transport::connect().await {
                Ok(stream) => {
                    let (rd, wr) = tokio::io::split(stream);
                    return Self { rd, wr, next_id: 1 };
                }
                Err(_) if Instant::now() < deadline => {
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
                Err(e) => panic!("no se pudo conectar al daemon: {e}"),
            }
        }
    }

    /// Envía una petición y devuelve su respuesta; acumula en `events` lo que llegue entretanto.
    async fn call(&mut self, request: Request, events: &mut Vec<Event>) -> Response {
        let id = self.next_id;
        self.next_id += 1;
        frame::write_frame(&mut self.wr, &ClientMessage { id, request })
            .await
            .unwrap();
        loop {
            match self.next().await {
                ServerMessage::Response { id: got, response } if got == id => return response,
                ServerMessage::Response { .. } => {}
                ServerMessage::Event(event) => events.push(event),
            }
        }
    }

    async fn next(&mut self) -> ServerMessage {
        tokio::time::timeout(TIMEOUT, frame::read_frame(&mut self.rd))
            .await
            .expect("timeout esperando al daemon")
            .unwrap()
            .expect("el daemon cerró la conexión")
    }

    /// Lee eventos hasta que la sesión termine; devuelve toda la salida como texto.
    async fn read_until_exit(&mut self, mut events: Vec<Event>) -> String {
        let mut output = Vec::new();
        loop {
            for event in events.drain(..) {
                match event {
                    Event::Snapshot { bytes, .. } => output = bytes,
                    Event::Output { bytes, .. } => output.extend(bytes),
                    Event::Exited { .. } => return String::from_utf8_lossy(&output).into_owned(),
                }
            }
            if let ServerMessage::Event(event) = self.next().await {
                events.push(event);
            }
        }
    }
}

struct DaemonProcess(Child);

impl Drop for DaemonProcess {
    fn drop(&mut self) {
        let _ = self.0.kill();
    }
}

fn echo_command() -> Vec<String> {
    if cfg!(windows) {
        vec!["cmd.exe".into(), "/c".into(), "echo hola-lenz".into()]
    } else {
        vec!["/bin/sh".into(), "-c".into(), "echo hola-lenz".into()]
    }
}

#[tokio::test]
async fn sessions_survive_client_disconnect() {
    let unique = format!("e2e-{}", std::process::id());
    let data_dir = std::env::temp_dir().join(format!("lenz-{unique}"));
    let endpoint = if cfg!(windows) {
        format!(r"\\.\pipe\lenz-{unique}")
    } else {
        data_dir.join("daemon.sock").to_string_lossy().into_owned()
    };
    // El cliente de este test usa las mismas variables que el daemon.
    std::env::set_var(paths::DATA_DIR_ENV, &data_dir);
    std::env::set_var(paths::ENDPOINT_ENV, &endpoint);

    let _daemon = DaemonProcess(
        Command::new(env!("CARGO_BIN_EXE_lenz-daemon"))
            .args(["--build-id", "e2e"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("no se pudo lanzar lenz-daemon"),
    );

    let mut events = Vec::new();
    let mut client = Client::connect().await;

    let hello = client
        .call(
            Request::Hello {
                protocol_version: 1,
            },
            &mut events,
        )
        .await;
    assert!(
        matches!(hello, Response::Hello { ref build_id, .. } if build_id == "e2e"),
        "{hello:?}"
    );

    let created = client
        .call(
            Request::CreateSession {
                cwd: None,
                command: Some(echo_command()),
                cols: 80,
                rows: 24,
            },
            &mut events,
        )
        .await;
    let Response::Session(SessionInfo { id, .. }) = created else {
        panic!("se esperaba Session, llegó {created:?}");
    };

    let subscribed = client
        .call(
            Request::Subscribe {
                session: id.clone(),
            },
            &mut events,
        )
        .await;
    assert_eq!(subscribed, Response::Ok);
    let output = client.read_until_exit(events).await;
    assert!(
        output.contains("hola-lenz"),
        "salida inesperada: {output:?}"
    );

    // Desconectar y volver: la sesión sigue en el daemon con su scrollback.
    drop(client);
    let mut events = Vec::new();
    let mut client = Client::connect().await;
    let Response::Sessions(sessions) = client.call(Request::ListSessions, &mut events).await else {
        panic!("se esperaba Sessions");
    };
    let session = sessions
        .iter()
        .find(|s| s.id == id)
        .expect("la sesión desapareció");
    assert!(session.exited);

    client
        .call(
            Request::Subscribe {
                session: id.clone(),
            },
            &mut events,
        )
        .await;
    let replay = client.read_until_exit(events).await;
    assert!(
        replay.contains("hola-lenz"),
        "el snapshot no conservó la salida: {replay:?}"
    );

    let mut events = Vec::new();
    assert_eq!(
        client
            .call(Request::CloseSession { session: id }, &mut events)
            .await,
        Response::Ok
    );
    assert_eq!(
        client.call(Request::Shutdown, &mut events).await,
        Response::Ok
    );
    let _ = std::fs::remove_dir_all(&data_dir);
}
