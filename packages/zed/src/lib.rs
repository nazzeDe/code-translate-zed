use zed_extension_api as zed;

struct CodeTranslateExtension;

impl zed::Extension for CodeTranslateExtension {
    fn new() -> Self {
        Self
    }
}

zed::register_extension!(CodeTranslateExtension);
