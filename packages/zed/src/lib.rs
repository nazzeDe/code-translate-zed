use std::path::PathBuf;

use zed_extension_api as zed;

struct CodeTranslateExtension;

const NPM_PACKAGE: &str = "code-translate-lsp";

fn language_server_script_path() -> PathBuf {
    PathBuf::from("node_modules")
        .join(NPM_PACKAGE)
        .join("dist")
        .join("server.js")
}

impl CodeTranslateExtension {
    fn install_package_if_needed(language_server_id: &zed::LanguageServerId) -> zed::Result<()> {
        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::CheckingForUpdate,
        );

        let installation_result: zed::Result<()> = (|| {
            let latest_version = zed::npm_package_latest_version(NPM_PACKAGE)?;
            let installed_version = zed::npm_package_installed_version(NPM_PACKAGE)?;

            if installed_version.as_deref() != Some(latest_version.as_str()) {
                zed::set_language_server_installation_status(
                    language_server_id,
                    &zed::LanguageServerInstallationStatus::Downloading,
                );
                zed::npm_install_package(NPM_PACKAGE, &latest_version)?;
            }

            Ok(())
        })();

        match &installation_result {
            Ok(()) => zed::set_language_server_installation_status(
                language_server_id,
                &zed::LanguageServerInstallationStatus::None,
            ),
            Err(error) => zed::set_language_server_installation_status(
                language_server_id,
                &zed::LanguageServerInstallationStatus::Failed(error.clone()),
            ),
        }

        installation_result
    }
}

impl zed::Extension for CodeTranslateExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        language_server_id: &zed::LanguageServerId,
        _worktree: &zed::Worktree,
    ) -> zed::Result<zed::Command> {
        Self::install_package_if_needed(language_server_id)?;

        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![
                language_server_script_path().to_string_lossy().into_owned(),
                "--stdio".to_string(),
            ],
            env: Default::default(),
        })
    }
}

zed::register_extension!(CodeTranslateExtension);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_server_script_uses_package_dist_entry() {
        let expected: PathBuf = ["node_modules", NPM_PACKAGE, "dist", "server.js"]
            .iter()
            .collect();

        assert_eq!(language_server_script_path(), expected);
    }
}
