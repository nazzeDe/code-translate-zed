use std::path::PathBuf;

use zed_extension_api as zed;

struct CodeTranslateExtension;

const NPM_PACKAGE: &str = "code-translate-lsp";

#[derive(Debug, PartialEq, Eq)]
enum PackageAction {
    UseInstalled,
    Install(String),
}

fn package_action(
    installed_version: Option<&str>,
    latest_version: zed::Result<String>,
) -> zed::Result<PackageAction> {
    match latest_version {
        Ok(latest_version) if installed_version == Some(latest_version.as_str()) => {
            Ok(PackageAction::UseInstalled)
        }
        Ok(latest_version) => Ok(PackageAction::Install(latest_version)),
        Err(_error) if installed_version.is_some() => Ok(PackageAction::UseInstalled),
        Err(error) => Err(error),
    }
}

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
            let installed_version = zed::npm_package_installed_version(NPM_PACKAGE)?;
            let action = package_action(
                installed_version.as_deref(),
                zed::npm_package_latest_version(NPM_PACKAGE),
            )?;

            if let PackageAction::Install(latest_version) = action {
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

    #[test]
    fn local_package_is_used_when_latest_version_lookup_fails() {
        let action = package_action(Some("0.1.0"), Err("package is not published".to_string()));

        assert_eq!(action, Ok(PackageAction::UseInstalled));
    }

    #[test]
    fn published_package_is_updated_when_latest_version_differs() {
        let action = package_action(Some("0.1.0"), Ok("0.2.0".to_string()));

        assert_eq!(action, Ok(PackageAction::Install("0.2.0".to_string())));
    }

    #[test]
    fn unavailable_latest_version_still_fails_without_an_installation() {
        let action = package_action(None, Err("package is not published".to_string()));

        assert_eq!(action, Err("package is not published".to_string()));
    }
}
