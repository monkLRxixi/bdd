fn main() {
    tauri_build::build();

    // `cargo test` binaries do not receive the Windows application manifest that
    // `tauri-build` links into regular binaries. Without it the loader resolves
    // comctl32 v5 and fails with STATUS_ENTRYPOINT_NOT_FOUND (TaskDialogIndirect).
    // Reuse the resource archive tauri-build just produced so tests can run.
    if cfg!(target_os = "windows") {
        if let Ok(out_dir) = std::env::var("OUT_DIR") {
            let resource = format!("{}/resource.lib", out_dir.replace('\\', "/"));
            println!("cargo:rustc-link-arg-tests={resource}");
        }
    }
}
