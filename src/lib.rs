//! Deliver's deterministic policy engine. Browser measurements are observations,
//! not a trusted media decoder, certification, or evidence of received-byte origin.
use serde::{Deserialize, Serialize};

pub const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
pub const ENGINE_VERSION: &str = "deliver-core/0.1.0";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Policy {
    pub id: String,
    pub version: u32,
    pub title: String,
    pub width: u32,
    pub height: u32,
    pub min_duration_seconds: f64,
    pub max_duration_seconds: f64,
    pub max_bytes: u64,
    pub container: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Asset {
    pub filename: String,
    pub bytes: u64,
    pub container: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration_seconds: Option<f64>,
    pub sha256: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub policy: Policy,
    pub asset: Asset,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Pass,
    Fail,
    Unknown,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Check {
    pub id: String,
    pub title: String,
    pub status: Status,
    pub observed: String,
    pub expected: String,
    pub source: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Report {
    pub schema: String,
    pub engine: String,
    pub policy: Policy,
    pub asset: Asset,
    pub checks: Vec<Check>,
    pub pass: usize,
    pub fail: usize,
    pub unknown: usize,
    pub outcome: String,
    pub limitations: Vec<String>,
}
fn check(
    id: &str,
    title: &str,
    status: Status,
    observed: String,
    expected: String,
    source: &str,
) -> Check {
    Check {
        id: id.into(),
        title: title.into(),
        status,
        observed,
        expected,
        source: source.into(),
    }
}
fn verdict(ok: bool) -> Status {
    if ok { Status::Pass } else { Status::Fail }
}
fn known_container(s: &str) -> bool {
    matches!(s, "mp4" | "webm")
}

pub fn validate(request: Request) -> Result<Report, String> {
    let Request {
        policy: p,
        asset: a,
    } = request;
    if p.id.is_empty()
        || p.id.len() > 80
        || p.title.is_empty()
        || p.title.len() > 160
        || p.version == 0
    {
        return Err(
            "A policy needs an ID, title, and positive version within the supported text limits."
                .into(),
        );
    }
    if p.width == 0 || p.height == 0 || p.width > 16384 || p.height > 16384 {
        return Err("Required width and height must be between 1 and 16384 pixels.".into());
    }
    if !p.min_duration_seconds.is_finite()
        || !p.max_duration_seconds.is_finite()
        || p.min_duration_seconds < 0.0
        || p.max_duration_seconds <= 0.0
        || p.min_duration_seconds > p.max_duration_seconds
        || p.max_duration_seconds > 86400.0
    {
        return Err("Duration range must be ordered, finite, and within 0–86400 seconds.".into());
    }
    if p.max_bytes == 0 || p.max_bytes > MAX_FILE_BYTES || !known_container(&p.container) {
        return Err("Policies support MP4/WebM and a maximum size of 1 byte to 64 MiB.".into());
    }
    if a.filename.is_empty() || a.filename.len() > 1024 || a.bytes == 0 || a.bytes > MAX_FILE_BYTES
    {
        return Err(
            "Select one non-empty file up to 64 MiB with a supported filename length.".into(),
        );
    }
    if !matches!(a.container.as_str(), "mp4" | "webm" | "unknown") {
        return Err("Unrecognized observed container value.".into());
    }
    if a.width.is_some_and(|v| v == 0 || v > 16384)
        || a.height.is_some_and(|v| v == 0 || v > 16384)
        || a.duration_seconds
            .is_some_and(|v| !v.is_finite() || v <= 0.0 || v > 86400.0)
    {
        return Err("The media observations are outside this demo's supported bounds.".into());
    }
    if a.sha256
        .as_ref()
        .is_some_and(|s| s.len() != 64 || !s.bytes().all(|b| b.is_ascii_hexdigit()))
    {
        return Err("SHA-256 must be a 64-character hexadecimal digest.".into());
    }
    let mut checks = vec![
        check(
            "bytes",
            "File size",
            verdict(a.bytes <= p.max_bytes),
            format!("{} bytes", a.bytes),
            format!("At most {} bytes", p.max_bytes),
            "File API byte length",
        ),
        check(
            "container",
            "Container signature",
            if a.container == "unknown" {
                Status::Unknown
            } else {
                verdict(a.container == p.container)
            },
            a.container.to_uppercase(),
            p.container.to_uppercase(),
            "Bounded header signature; not complete structural validation",
        ),
    ];
    for (id, title, observed, expected) in [
        ("width", "Display width", a.width, p.width),
        ("height", "Display height", a.height, p.height),
    ] {
        checks.push(check(
            id,
            title,
            observed
                .map(|v| verdict(v == expected))
                .unwrap_or(Status::Unknown),
            observed
                .map(|v| format!("{v} px"))
                .unwrap_or("Unavailable".into()),
            format!("{expected} px"),
            "Browser video metadata; display dimensions may reflect rotation",
        ));
    }
    checks.push(check(
        "duration",
        "Duration",
        a.duration_seconds
            .map(|v| verdict(v >= p.min_duration_seconds && v <= p.max_duration_seconds))
            .unwrap_or(Status::Unknown),
        a.duration_seconds
            // Match the shortest faithful scalar used for the limits; fixed rounding
            // can otherwise hide a true boundary failure (e.g. 6.00001 > 6).
            .map(|v| format!("{v} seconds"))
            .unwrap_or("Unavailable".into()),
        format!(
            "{}–{} seconds (inclusive)",
            p.min_duration_seconds, p.max_duration_seconds
        ),
        "Browser video metadata; no frame-by-frame scan",
    ));
    checks.push(check(
        "sha256",
        "Selected-byte fingerprint",
        if a.sha256.is_some() {
            Status::Pass
        } else {
            Status::Unknown
        },
        a.sha256.clone().unwrap_or("Unavailable".into()),
        "SHA-256 of the entire selected file".into(),
        "Browser Web Crypto; identifies local bytes, not provenance or recipient bytes",
    ));
    for (id, title) in [
        ("codec", "Codec and frame rate"),
        ("color", "Color space / HDR"),
        ("audio", "Audio loudness / channels"),
        ("subtitles", "Subtitle completeness"),
        ("visual", "Visual / audible defects"),
    ] {
        checks.push(check(
            id,
            title,
            Status::Unknown,
            "Not measured".into(),
            "Requires a dedicated media probe or human review".into(),
            "Outside browser inspection scope",
        ));
    }
    let pass = checks.iter().filter(|c| c.status == Status::Pass).count();
    let fail = checks.iter().filter(|c| c.status == Status::Fail).count();
    let unknown = checks.len() - pass - fail;
    Ok(Report {
        schema: "deliver.evidence.v1".into(), engine: ENGINE_VERSION.into(), policy: p, asset: a, checks, pass, fail, unknown,
        outcome: if fail > 0 { "changes_required".into() } else { "manual_review_required".into() },
        limitations: vec![
            "This is a local technical-validation demo, not delivery certification or a full QC pass.".into(),
            "Browser observations may differ from encoded-track metadata. No frame scan, encoder, upload, server processing, or recipient-byte verification is performed.".into(),
            "A header signature only suggests a container. It does not validate the complete container structure or trust the file's MIME type.".into(),
            "SHA-256 identifies the selected bytes. It does not prove origin, approval authenticity, or that a recipient received the same bytes.".into(),
            "Human QC is self-reported and kept separate from automated unknowns.".into(),
        ],
    })
}

pub fn evaluate_json(input: &[u8]) -> String {
    let result = if input.len() > 32768 {
        Err("Engine input exceeds 32 KiB.".into())
    } else {
        serde_json::from_slice::<Request>(input)
            .map_err(|_| {
                "Invalid engine request. Check required fields and numeric values.".to_string()
            })
            .and_then(validate)
    };
    match result {
        Ok(report) => serde_json::json!({"ok":true,"report":report}).to_string(),
        Err(error) => serde_json::json!({"ok":false,"error":error}).to_string(),
    }
}

// Minimal internal ABI: only pointers allocated by this module may be supplied.
#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub extern "C" fn allocate(len: u32) -> u32 {
    if len == 0 || len > 32768 {
        return 0;
    }
    let block = vec![0u8; len as usize].into_boxed_slice();
    Box::into_raw(block) as *mut u8 as u32
}
#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn release(ptr: u32, len: u32) {
    if ptr != 0 && len != 0 {
        unsafe {
            drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(
                ptr as *mut u8,
                len as usize,
            )));
        }
    }
}
#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn evaluate(ptr: u32, len: u32) -> u64 {
    let answer = if len == 0 || len > 32768 || ptr == 0 {
        "{\"ok\":false,\"error\":\"Invalid input length\"}".to_string()
    } else {
        evaluate_json(unsafe { std::slice::from_raw_parts(ptr as *const u8, len as usize) })
    };
    let bytes = answer.into_bytes().into_boxed_slice();
    let length = bytes.len() as u64;
    let pointer = Box::into_raw(bytes) as *mut u8 as u32;
    (length << 32) | pointer as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> Request {
        Request {
            policy: Policy {
                id: "hd-review".into(),
                version: 1,
                title: "HD review".into(),
                width: 1920,
                height: 1080,
                min_duration_seconds: 1.0,
                max_duration_seconds: 120.0,
                max_bytes: MAX_FILE_BYTES,
                container: "mp4".into(),
            },
            asset: Asset {
                filename: "sample.mp4".into(),
                bytes: 1000,
                container: "mp4".into(),
                width: Some(1920),
                height: Some(1080),
                duration_seconds: Some(6.0),
                sha256: Some("a".repeat(64)),
            },
        }
    }
    #[test]
    fn valid_still_requires_review() {
        let r = validate(request()).unwrap();
        assert_eq!((r.pass, r.fail, r.unknown), (6, 0, 5));
        assert_eq!(r.outcome, "manual_review_required");
    }
    #[test]
    fn boundary_size_passes_but_over_limit_rejected() {
        let mut r = request();
        r.asset.bytes = MAX_FILE_BYTES;
        assert_eq!(validate(r.clone()).unwrap().fail, 0);
        r.asset.bytes += 1;
        assert!(validate(r).is_err());
    }
    #[test]
    fn custom_size_failure() {
        let mut r = request();
        r.policy.max_bytes = 999;
        let out = validate(r).unwrap();
        assert_eq!(out.fail, 1);
        assert_eq!(out.outcome, "changes_required");
    }
    #[test]
    fn duration_inclusive_boundaries_and_failure() {
        for d in [1.0, 120.0] {
            let mut r = request();
            r.asset.duration_seconds = Some(d);
            assert_eq!(validate(r).unwrap().fail, 0);
        }
        let mut r = request();
        r.asset.duration_seconds = Some(120.001);
        assert_eq!(validate(r).unwrap().fail, 1);
    }
    #[test]
    fn duration_just_above_limit_keeps_visible_precision() {
        let mut r = request();
        r.policy.max_duration_seconds = 6.0;
        r.asset.duration_seconds = Some(6.00001);
        let out = validate(r).unwrap();
        let duration = out.checks.iter().find(|c| c.id == "duration").unwrap();
        assert_eq!(duration.status, Status::Fail);
        assert_eq!(duration.observed, "6.00001 seconds");
        assert_eq!(duration.expected, "1–6 seconds (inclusive)");
    }
    #[test]
    fn duration_just_below_limit_keeps_visible_precision() {
        let mut r = request();
        r.policy.min_duration_seconds = 6.0;
        r.asset.duration_seconds = Some(5.99999);
        let out = validate(r).unwrap();
        let duration = out.checks.iter().find(|c| c.id == "duration").unwrap();
        assert_eq!(duration.status, Status::Fail);
        assert_eq!(duration.observed, "5.99999 seconds");
        assert_eq!(duration.expected, "6–120 seconds (inclusive)");
    }
    #[test]
    fn dimensions_and_container_fail() {
        let mut r = request();
        r.asset.width = Some(1280);
        r.asset.height = Some(720);
        r.asset.container = "webm".into();
        assert_eq!(validate(r).unwrap().fail, 3);
    }
    #[test]
    fn unavailable_is_unknown_not_pass() {
        let mut r = request();
        r.asset.width = None;
        r.asset.height = None;
        r.asset.duration_seconds = None;
        r.asset.sha256 = None;
        r.asset.container = "unknown".into();
        let o = validate(r).unwrap();
        assert_eq!((o.pass, o.fail, o.unknown), (1, 0, 10));
    }
    #[test]
    fn policy_negative_boundaries() {
        let mut r = request();
        r.policy.version = 0;
        assert!(validate(r).is_err());
        let mut r = request();
        r.policy.width = 0;
        assert!(validate(r).is_err());
        let mut r = request();
        r.policy.height = 16385;
        assert!(validate(r).is_err());
        let mut r = request();
        r.policy.max_duration_seconds = f64::NAN;
        assert!(validate(r).is_err());
        let mut r = request();
        r.policy.min_duration_seconds = 121.0;
        assert!(validate(r).is_err());
        let mut r = request();
        r.policy.container = "anything".into();
        assert!(validate(r).is_err());
    }
    #[test]
    fn invalid_observations_rejected() {
        let mut r = request();
        r.asset.width = Some(0);
        assert!(validate(r).is_err());
        let mut r = request();
        r.asset.duration_seconds = Some(f64::INFINITY);
        assert!(validate(r).is_err());
        let mut r = request();
        r.asset.bytes = 0;
        assert!(validate(r).is_err());
        let mut r = request();
        r.asset.sha256 = Some("z".repeat(64));
        assert!(validate(r).is_err());
    }
    #[test]
    fn invalid_json_and_limits_are_safe_errors() {
        for s in [b"<script>".as_slice(), b"{}", b"null", b"{\"x\":1}"] {
            assert!(evaluate_json(s).contains("\"ok\":false"));
        }
        assert!(evaluate_json(&vec![b' '; 32769]).contains("32 KiB"));
    }
    #[test]
    fn filename_is_data() {
        let mut r = request();
        r.asset.filename = "<img src=x onerror=alert(1)>".into();
        let o = validate(r).unwrap();
        assert_eq!(o.asset.filename, "<img src=x onerror=alert(1)>");
    }
    #[test]
    fn schema_rejects_surplus_or_coerced_values() {
        let mut j = serde_json::to_value(request()).unwrap();
        j["unknown"] = true.into();
        assert!(evaluate_json(j.to_string().as_bytes()).contains("\"ok\":false"));
        let mut j = serde_json::to_value(request()).unwrap();
        j["asset"]["bytes"] = "1000".into();
        assert!(evaluate_json(j.to_string().as_bytes()).contains("\"ok\":false"));
    }
    #[test]
    fn policy_version_preserved() {
        let mut r = request();
        r.policy.version = 7;
        assert_eq!(validate(r).unwrap().policy.version, 7);
    }
}
