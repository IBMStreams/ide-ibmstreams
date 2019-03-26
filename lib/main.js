const cp = require('child_process')
const path = require('path')
const {shell} = require('electron')
const {AutoLanguageClient} = require('atom-languageclient')
const {actionProviderComposer, actionProviders} = require('./providers')
const os = require('os');

class SPLLanguageClient extends AutoLanguageClient {
  getGrammarScopes () { return [ 'source.spl' ] }
  getLanguageName () { return 'IBM Streams' }
  getServerName () { return 'SPL' }

  constructor () {
    super()
    this.statusElement = document.createElement('span')
    this.statusElement.className = 'inline-block'

    this.commands = {
      'java.ignoreIncompleteClasspath': () => { atom.config.set('ide-java.errors.incompleteClasspathSeverity', 'ignore') },
      'java.ignoreIncompleteClasspath.help': () => { shell.openExternal('https://github.com/atom/ide-java/wiki/Incomplete-Classpath-Warning') }
    }
  }

  startServerProcess (projectPath) {
    const serverHome = path.join(__dirname, '..', 'node_modules', '@ibmstreams', 'spl-lsp', 'bin')
    let launcher = os.platform() === 'win32' ? 'startSplLspServer.bat' : 'startSplLspServer';
    let command = os.platform() === 'win32' ? launcher : './' + launcher;

    return new Promise((resolve, reject) => {
        const args = []

        this.logger.debug(`starting "${command} ${args.join(' ')}"`)
        const childProcess = cp.spawn(command, args, { cwd: serverHome })
        this.captureServerErrors(childProcess)
        childProcess.on('exit', exitCode => {
          if (!childProcess.killed) {
            atom.notifications.addError('IDE-SPL language server stopped unexpectedly.', {
              dismissable: true,
              description: this.processStdErr ? `<code>${this.processStdErr}</code>` : `Exit code ${exitCode}`
            })
          }
          this.updateStatusBar('Stopped')
        })
        resolve(childProcess);
      }
    )
  }

  updateStatusBar (text) {
    this.statusElement.textContent = `${this.name} ${text}`
    if (!this.statusTile && this.statusBar) {
      this.statusTile = this.statusBar.addRightTile({ item: this.statusElement, priority: 1000 })
    }
  }

  getInitializeParams(projectPath, process) {
    const initParams = super.getInitializeParams(projectPath, process);
    // send all the current package config settings to the server
    if (!initParams.initializationOptions) {
      initParams.initializationOptions = {};
    }
    initParams.initializationOptions.settings = atom.config.get('ide-ibmstreams');
    initParams.initializationOptions.contentAssistListIsComplete = false;
    return initParams;
  }

  postInitialization(server) {
    // Add a listener for package config changes
    server.disposable.add(atom.config.onDidChange('ide-ibmstreams', ({oldValue, newValue}) => {
      if (oldValue && newValue) {
          server.connection.didChangeConfiguration({
            settings: {
              oldValue: oldValue,
              newValue: newValue
            }
          });
      }
    }));
  }

  provideToolkitUpdater() {
    return {
      initializeToolkits: (settingsAction) => {
        console.log(this._serverManager.getActiveServers());
        this._serverManager.getActiveServers()[0].connection.didChangeConfiguration({
          settings: settingsAction
        });
        
      }
    };
  }
}

module.exports = new SPLLanguageClient()
module.exports.config = {
  // to access config, key is ide-spl.toolkitsPath
    toolkitsPath: {
      type: 'string',
      default: '',
      description: 'Path to a directory containing IBM Streams toolkits - [Refresh toolkits](atom://build-ibmstreams/toolkits/refresh)'
    }
  }
