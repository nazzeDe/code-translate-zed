import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createConnection,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import { createDictionaryStore } from "./dictionary.js";
import { createHoverProvider } from "./hover.js";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

const dictDir = join(dirname(fileURLToPath(import.meta.url)), "dict");
const store = createDictionaryStore(dictDir);
const provideHover = createHoverProvider(store);

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    hoverProvider: true,
  },
}));

connection.onHover(({ textDocument, position }) => {
  const document = documents.get(textDocument.uri);
  return document ? provideHover(document, position) : null;
});

documents.listen(connection);
connection.listen();
