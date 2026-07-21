import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = join(packageRoot, "dist", "server.js");
const messageSeparator = Buffer.from("\r\n\r\n");
const responseTimeoutMs = 10_000;

function encodeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"),
    body,
  ]);
}

function createProtocolClient(server) {
  let buffer = Buffer.alloc(0);
  const messages = [];
  const waiters = [];
  let streamError;
  let stderr = "";

  const rejectWaiters = (error) => {
    streamError = error;
    while (waiters.length > 0) {
      waiters.shift().reject(error);
    }
  };

  const publish = (message) => {
    const waiter = waiters.shift();
    if (waiter) {
      waiter.resolve(message);
    } else {
      messages.push(message);
    }
  };

  server.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (true) {
      const headerEnd = buffer.indexOf(messageSeparator);
      if (headerEnd === -1) {
        return;
      }

      const headers = buffer.subarray(0, headerEnd).toString("ascii");
      const lengthMatch = headers.match(/^Content-Length: (\d+)$/);
      if (!lengthMatch) {
        rejectWaiters(
          new Error(`Invalid LSP response headers: ${JSON.stringify(headers)}`),
        );
        return;
      }

      const bodyLength = Number(lengthMatch[1]);
      const messageEnd = headerEnd + messageSeparator.length + bodyLength;
      if (buffer.length < messageEnd) {
        return;
      }

      const bodyStart = headerEnd + messageSeparator.length;
      const body = buffer.subarray(bodyStart, messageEnd).toString("utf8");
      buffer = buffer.subarray(messageEnd);

      try {
        publish(JSON.parse(body));
      } catch (error) {
        rejectWaiters(error);
        return;
      }
    }
  });

  server.stdout.on("error", rejectWaiters);
  server.stderr.setEncoding("utf8");
  server.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  server.on("error", rejectWaiters);
  server.on("exit", (code, signal) => {
    rejectWaiters(
      new Error(
        `LSP server exited before the response (code ${code}, signal ${signal})${stderr ? `\n${stderr}` : ""}`,
      ),
    );
  });

  return {
    notify(method, params) {
      server.stdin.write(encodeMessage({ jsonrpc: "2.0", method, params }));
    },
    async request(id, method, params) {
      server.stdin.write(encodeMessage({ jsonrpc: "2.0", id, method, params }));

      if (streamError) {
        throw streamError;
      }
      if (messages.length > 0) {
        return messages.shift();
      }

      return new Promise((resolve, reject) => {
        const waiter = {
          resolve: (message) => {
            clearTimeout(timeout);
            resolve(message);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          },
        };
        const timeout = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index !== -1) {
            waiters.splice(index, 1);
          }
          reject(
            new Error(
              `Timed out waiting for response to ${method}${stderr ? `\n${stderr}` : ""}`,
            ),
          );
        }, responseTimeoutMs);
        waiters.push(waiter);
      });
    },
  };
}

test("built stdio server handles initialization and Hover edge cases", async (t) => {
  await execFileAsync(process.execPath, ["scripts/build.mjs"], {
    cwd: packageRoot,
  });

  const server = spawn(process.execPath, [serverPath, "--stdio"], {
    cwd: packageRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const client = createProtocolClient(server);

  try {
    const initialize = await client.request(1, "initialize", {
      processId: null,
      rootUri: null,
      capabilities: {},
    });

    await t.test("initialize advertises incremental Hover support", () => {
      assert.equal(initialize.jsonrpc, "2.0");
      assert.equal(initialize.id, 1);
      assert.equal(initialize.result.capabilities.textDocumentSync, 2);
      assert.equal(initialize.result.capabilities.hoverProvider, true);
    });

    client.notify("initialized", {});
    const uri = "file:///workspace/example.txt";
    client.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: "plaintext",
        version: 1,
        text: '😀 "hello",',
      },
    });

    await t.test(
      "known token returns Markdown and its UTF-16 range",
      async () => {
        const knownHover = await client.request(2, "textDocument/hover", {
          textDocument: { uri },
          position: { line: 0, character: 6 },
        });

        assert.equal(knownHover.result.contents.kind, "markdown");
        assert.ok(
          knownHover.result.contents.value.includes(
            "[**hello**](https://translate.google.com/",
          ),
        );
        assert.ok(
          knownHover.result.contents.value.includes("interj") &&
            knownHover.result.contents.value.includes("喂\\, 嘿"),
        );
        assert.deepEqual(knownHover.result.range, {
          start: { line: 0, character: 4 },
          end: { line: 0, character: 9 },
        });
      },
    );

    await t.test("unopened document returns null", async () => {
      const unopenedHover = await client.request(3, "textDocument/hover", {
        textDocument: { uri: "file:///workspace/unopened.txt" },
        position: { line: 0, character: 1 },
      });
      assert.equal(unopenedHover.result, null);
    });

    await t.test("position outside a token returns null", async () => {
      const emptyPositionHover = await client.request(4, "textDocument/hover", {
        textDocument: { uri },
        position: { line: 0, character: 9 },
      });
      assert.equal(emptyPositionHover.result, null);
    });

    await t.test(
      "incremental changes update the tracked document",
      async () => {
        client.notify("textDocument/didChange", {
          textDocument: { uri, version: 2 },
          contentChanges: [
            {
              range: {
                start: { line: 0, character: 4 },
                end: { line: 0, character: 9 },
              },
              text: "world",
            },
          ],
        });

        const changedHover = await client.request(5, "textDocument/hover", {
          textDocument: { uri },
          position: { line: 0, character: 6 },
        });
        assert.ok(changedHover.result.contents.value.includes("text=world"));
        assert.deepEqual(changedHover.result.range, {
          start: { line: 0, character: 4 },
          end: { line: 0, character: 9 },
        });
      },
    );
  } finally {
    server.kill();
  }
});
