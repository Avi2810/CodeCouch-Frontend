import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import * as monaco from 'monaco-editor';

// Monaco worker configuration
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker()
    }
    if (label === 'json') {
      return new jsonWorker()
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker()
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker()
    }
    return new editorWorker()
  }
}

// setup editor
function initEditor(ytext) {  
  const editor = new monaco.editor.create(document.getElementById('editor'), {
    language: "python", 
    theme: "vs-dark",
    fontSize: 14,
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    lineNumbers: 'on',
    renderLineHighlight: 'all',
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    automaticLayout: true
  });

  // Bind Monaco <-> Yjs
  new MonacoBinding(
  ytext,
  editor.getModel(),
  new Set([editor])
  )
  return editor;
}

// setup yjs
function setupYjs() {
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText('monaco');
  return {ydoc, ytext};
}

// setup websocket
// function setupWebsocket(roomId, token) {
//   const socket = new WebSocket(`${WS_URL}/ws/room/${roomId}?token=${token}`);
//   socket.binaryType = 'arraybuffer';
//   return socket;
// }

function setupCollab(socket, ydoc) {
  // When Yjs updates locally → send to server
  ydoc.on('update', update => {
    socket.send(update);
  })

  // When server sends updates → apply to Yjs
  socket.onmessage = event => {
    const update = new Uint8Array(event.data)
    Y.applyUpdate(ydoc, update)
  } 
}

function setLanguage(editor, language) {
  const model = editor.getModel();
  monaco.editor.setModelLanguage(model, language);
}

export { initEditor, setupYjs, setupCollab, monaco, setLanguage };