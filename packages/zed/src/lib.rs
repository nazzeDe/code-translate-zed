use std::env;
use std::path::{Path, PathBuf};

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
        Err(_) if installed_version.is_some() => Ok(PackageAction::UseInstalled),
        Err(error) => Err(error),
    }
}

fn language_server_script_path(work_directory: &Path) -> PathBuf {
    work_directory
        .join("node_modules")
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
        let work_directory = env::current_dir().map_err(|error| error.to_string())?;

        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![
                language_server_script_path(&work_directory)
                    .to_string_lossy()
                    .into_owned(),
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

    fn extension_manifest() -> toml::Value {
        toml::from_str(include_str!("../extension.toml")).unwrap()
    }

    #[test]
    fn language_server_script_resolves_from_the_extension_work_directory() {
        let work_directory = Path::new("extension-work");
        let expected = work_directory
            .join("node_modules")
            .join(NPM_PACKAGE)
            .join("dist")
            .join("server.js");

        assert_eq!(language_server_script_path(work_directory), expected);
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
    fn published_package_is_reused_when_latest_version_matches() {
        let action = package_action(Some("0.1.0"), Ok("0.1.0".to_string()));

        assert_eq!(action, Ok(PackageAction::UseInstalled));
    }

    #[test]
    fn unavailable_latest_version_still_fails_without_an_installation() {
        let action = package_action(None, Err("package is not published".to_string()));

        assert_eq!(action, Err("package is not published".to_string()));
    }

    #[test]
    fn manifest_registers_exactly_the_supported_languages() {
        let manifest = extension_manifest();
        assert_eq!(manifest["language_servers"].as_table().unwrap().len(), 1);
        let languages = manifest["language_servers"]["code-translate"]["languages"]
            .as_array()
            .unwrap()
            .iter()
            .map(|language| language.as_str().unwrap())
            .collect::<Vec<_>>();

        assert_eq!(
            languages,
            vec![
                "Rust",
                "Python",
                "Go",
                "JavaScript",
                "TypeScript",
                "Markdown"
            ]
        );
        assert!(!languages.iter().any(|language| *language == "JSX"));
        assert!(!languages.iter().any(|language| *language == "TSX"));
    }

    #[test]
    fn manifest_declares_required_metadata_and_the_npm_capability() {
        let manifest = extension_manifest();
        let capabilities = manifest["capabilities"].as_array().unwrap();

        assert_eq!(manifest["id"].as_str(), Some("code-translate"));
        assert_eq!(manifest["name"].as_str(), Some("Code Translate"));
        assert_eq!(
            manifest["description"].as_str(),
            Some("Offline identifier translation using local dictionaries")
        );
        assert_eq!(manifest["version"].as_str(), Some("0.1.0"));
        assert_eq!(manifest["schema_version"].as_integer(), Some(1));
        assert_eq!(
            manifest["authors"].as_array().unwrap()[0].as_str(),
            Some("nazzeDe")
        );
        assert_eq!(
            manifest["repository"].as_str(),
            Some("https://github.com/nazzeDe/code-translate-zed")
        );
        assert_eq!(capabilities.len(), 1);
        assert_eq!(capabilities[0]["kind"].as_str(), Some("npm:install"));
        assert_eq!(capabilities[0]["package"].as_str(), Some(NPM_PACKAGE));
        assert_eq!(capabilities[0].as_table().unwrap().len(), 2);
    }

    #[test]
    fn manifest_crate_targets_wasm_and_zed_api_0_7_0() {
        let cargo: toml::Value = toml::from_str(include_str!("../Cargo.toml")).unwrap();
        let crate_types = cargo["lib"]["crate-type"].as_array().unwrap();

        assert_eq!(crate_types.len(), 1);
        assert_eq!(crate_types[0].as_str(), Some("cdylib"));
        assert_eq!(
            cargo["dependencies"]["zed_extension_api"].as_str(),
            Some("0.7.0")
        );
    }
}
