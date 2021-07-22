import * as vscode from 'vscode';
import { HttpFileSendContext, HttpRegionSendContext, send, io, utils } from 'httpyac';
import { DocumentStore } from '../documentStore';
import { getOutputChannel, logToOuputChannelFactory } from '../io';
import { getEnvironmentConfig, getResourceConfig } from '../config';

export type DocumentArgument = vscode.TextDocument | vscode.TextEditor | vscode.Uri | undefined;
export type LineArgument = number | vscode.Position | vscode.Range | undefined;

export async function getHttpRegionFromLine(
  documentArg: DocumentArgument,
  line: LineArgument,
  documentStore: DocumentStore
): Promise<HttpRegionSendContext | undefined> {
  const editor = getTextEditor(documentArg);
  if (editor) {
    const httpFile = await documentStore.getHttpFile(editor.document);
    if (httpFile) {
      const currentLine = getLine(line, editor);
      const httpRegion = httpFile.httpRegions.find(obj => obj.symbol.startLine <= currentLine && currentLine <= obj.symbol.endLine);
      if (httpRegion) {
        return {
          httpRegion,
          httpFile
        };
      }
    }
  }
  return undefined;
}

function getLine(line: LineArgument, editor: vscode.TextEditor): number {
  if (line) {
    if (Number.isInteger(line)) {
      return line as number;
    }
    if (line instanceof vscode.Position) {
      return line.line;
    }
    if (line instanceof vscode.Range) {
      return line.start.line;
    }
  }
  if (!!editor.selections && editor.selections.length > 0) {
    return editor.selection.active.line;
  }
  return 0;
}


function getTextEditor(documentIdentifier: DocumentArgument): vscode.TextEditor | undefined {
  let editor: vscode.TextEditor | undefined;
  if (isTextEditor(documentIdentifier)) {
    editor = documentIdentifier;
  } else if (isTextDocument(documentIdentifier)) {
    editor = vscode.window.visibleTextEditors.find(obj => obj.document === documentIdentifier);
  } else if (documentIdentifier instanceof vscode.Uri) {
    editor = vscode.window.visibleTextEditors.find(obj => obj.document.uri === documentIdentifier);
  }
  return editor || vscode.window.activeTextEditor;
}

function isTextDocument(documentIdentifier: DocumentArgument): documentIdentifier is vscode.TextDocument {
  const doc = documentIdentifier as vscode.TextDocument;

  return doc && !!doc.getText && doc.uri instanceof vscode.Uri;
}

function isTextEditor(documentIdentifier: DocumentArgument): documentIdentifier is vscode.TextEditor {
  const editor = documentIdentifier as vscode.TextEditor;
  return editor && !!editor.document && isTextDocument(editor.document);
}


export async function sendContext(context: HttpRegionSendContext | HttpFileSendContext | undefined): Promise<boolean> {

  if (context) {
    const resourceConfig = getResourceConfig(context.httpFile);
    const config = await getEnvironmentConfig(context.httpFile.fileName);
    if (!context.scriptConsole) {
      context.scriptConsole = new io.Logger({
        level: config.log?.level,
        logMethod: logToOuputChannelFactory('Console'),
      });
    }
    if (resourceConfig.logRequest && !context.logResponse) {
      context.logResponse = utils.requestLoggerFactory((arg: string) => {
        const requestChannel = getOutputChannel('Request');
        requestChannel.appendLine(arg);
      }, {
        requestOutput: true,
        requestHeaders: true,
        requestBodyLength: 0,
        responseHeaders: true,
        responseBodyLength: resourceConfig.logResponseBodyLength,
      });
    }

    if (!context.config) {
      context.config = config;
    }

    context.require = {
      vscode,
    };
    return await send(context);
  }
  return false;
}
