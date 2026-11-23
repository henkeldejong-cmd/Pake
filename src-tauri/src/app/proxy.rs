use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const PLUGIN_API_ALLOWLIST: &[&str] = &[
    "generativelanguage.googleapis.com",
    "openrouter.ai",
    "api.groq.com",
    "api.cerebras.ai",
    "api.elevenlabs.io",
    "r.jina.ai",
    "api.fxtwitter.com",
    "fxtwitter.com",
    "vxtwitter.com",
    "api.voicerss.org",
    "texttospeech.googleapis.com",
    "translate.google.com",
    "speech.platform.bing.com",
    "lrclib.net",
    "lyrics.ovh",
    "api.textyl.co",
    "some-random-api.com",
    "api.genius.com",
    "genius.com",
    "itunes.apple.com",
    "app.grayswan.ai",
];

#[derive(Deserialize)]
pub struct ProxyHttpRequest {
    pub url: String,
    pub method: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyHttpResponse {
    pub status: u16,
    pub status_text: String,
    pub final_url: String,
    pub response_text: String,
    pub response_headers: String,
}

#[tauri::command]
pub async fn proxy_http(req: ProxyHttpRequest) -> Result<ProxyHttpResponse, String> {
    let parsed = reqwest::Url::parse(&req.url).map_err(|e| e.to_string())?;
    let host = parsed.host_str().unwrap_or("");
    let allowed = PLUGIN_API_ALLOWLIST
        .iter()
        .any(|domain| host == *domain || host.ends_with(&format!(".{}", domain)));

    if !allowed {
        return Err(format!("Blocked non-allowlisted domain: {}", host));
    }

    let client = reqwest::Client::new();
    let method = req
        .method
        .as_deref()
        .unwrap_or("GET")
        .parse::<reqwest::Method>()
        .map_err(|e| e.to_string())?;

    let mut builder = client.request(method, parsed);

    if let Some(headers) = req.headers {
        for (k, v) in headers {
            if let (Ok(name), Ok(val)) = (
                reqwest::header::HeaderName::from_bytes(k.as_bytes()),
                reqwest::header::HeaderValue::from_str(&v),
            ) {
                builder = builder.header(name, val);
            }
        }
    }

    if let Some(body) = req.body {
        builder = builder.body(body);
    }

    let res = builder.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let status_text = res.status().canonical_reason().unwrap_or("").to_string();
    let final_url = res.url().to_string();
    let response_headers = res
        .headers()
        .iter()
        .filter_map(|(k, v)| v.to_str().ok().map(|val| format!("{}: {}", k.as_str(), val)))
        .collect::<Vec<_>>()
        .join("\r\n");
    let response_text = res.text().await.map_err(|e| e.to_string())?;

    Ok(ProxyHttpResponse {
        status,
        status_text,
        final_url,
        response_text,
        response_headers,
    })
}
