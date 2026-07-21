import {
  createConnection,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import { provideHover } from "./hover.js";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

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
