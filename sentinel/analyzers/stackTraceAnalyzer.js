/**
 * SENTINEL Stack Trace Analyzer
 * Analyse les stack traces pour identifier la cause racine des erreurs
 */

class StackTraceAnalyzer {
  constructor() {
    // Paths du projet pour identifier le code utilisateur
    this.userCodePaths = ['/server/', '/backend/', '/sentinel/', '/client/'];
    this.ignoredPaths = ['node_modules', 'internal/', 'node:'];
  }

  /**
   * Analyse une stack trace
   */
  analyze(error) {
    const stack = error.stack || '';
    const lines = stack.split('\n');

    const frames = lines.slice(1).map(l => this.parseStackFrame(l)).filter(f => f !== null);

    return {
      errorType: error.name || 'Error',
      message: error.message || '',
      stackDepth: frames.length,
      topFrame: frames[0] || null,
      allFrames: frames,
      rootFile: this.extractRootFile(frames),
      isNodeModules: this.isFromNodeModules(stack),
      isUserCode: this.isFromUserCode(stack),
      suggestedFix: this.suggestFix(error, frames)
    };
  }

  /**
   * Parse une ligne de stack trace
   */
  parseStackFrame(line) {
    // Format: "    at functionName (file.js:line:col)"
    const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);

    if (match) {
      return {
        function: match[1],
        file: match[2],
        line: parseInt(match[3]),
        column: parseInt(match[4]),
        isUserCode: this.isUserCodePath(match[2]),
        isNodeModule: match[2].includes('node_modules')
      };
    }

    // Format alternatif: "    at file.js:line:col"
    const simpleMatch = line.match(/at\s+(.+?):(\d+):(\d+)/);
    if (simpleMatch) {
      return {
        function: 'anonymous',
        file: simpleMatch[1],
        line: parseInt(simpleMatch[2]),
        column: parseInt(simpleMatch[3]),
        isUserCode: this.isUserCodePath(simpleMatch[1]),
        isNodeModule: simpleMatch[1].includes('node_modules')
      };
    }

    // Format: "    at functionName (native)"
    const nativeMatch = line.match(/at\s+(.+?)\s+\(native\)/);
    if (nativeMatch) {
      return {
        function: nativeMatch[1],
        file: 'native',
        line: 0,
        column: 0,
        isUserCode: false,
        isNodeModule: false
      };
    }

    return null;
  }

  /**
   * Verifie si un path est du code utilisateur
   */
  isUserCodePath(filePath) {
    return this.userCodePaths.some(p => filePath.includes(p));
  }

  /**
   * Extrait le premier fichier de code utilisateur
   */
  extractRootFile(frames) {
    const userFrame = frames.find(f => f.isUserCode && !f.isNodeModule);
    return userFrame ? `${userFrame.file}:${userFrame.line}` : null;
  }

  /**
   * Verifie si l'erreur vient de node_modules
   */
  isFromNodeModules(stack) {
    return stack.includes('node_modules');
  }

  /**
   * Verifie si l'erreur vient du code utilisateur
   */
  isFromUserCode(stack) {
    return this.userCodePaths.some(p => stack.includes(p));
  }

  /**
   * Suggere un fix base sur l'erreur
   */
  suggestFix(error, frames) {
    const message = (error.message || '').toLowerCase();
    const errorType = error.name || 'Error';

    // Database errors
    if (message.includes('database') || message.includes('connection') ||
        message.includes('econnrefused') || message.includes('postgres')) {
      return {
        category: 'database',
        suggestion: 'Check database connection and credentials. Verify DATABASE_URL is correct.',
        action: 'RESTART_DATABASE_POOL',
        priority: 'HIGH'
      };
    }

    // API rate limiting
    if (message.includes('rate limit') || message.includes('429') ||
        message.includes('too many requests')) {
      return {
        category: 'api',
        suggestion: 'Reduce API call frequency or implement caching. Consider using a fallback model.',
        action: 'FALLBACK_TO_HAIKU',
        priority: 'HIGH'
      };
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('etimedout') ||
        message.includes('took too long')) {
      return {
        category: 'performance',
        suggestion: 'Increase timeout or optimize the slow operation.',
        action: 'INCREASE_TIMEOUT',
        priority: 'MEDIUM'
      };
    }

    // Authentication errors
    if (message.includes('unauthorized') || message.includes('jwt') ||
        message.includes('token') || message.includes('authentication')) {
      return {
        category: 'authentication',
        suggestion: 'Verify token validity and expiration. Check authentication configuration.',
        action: 'LOG_AND_MONITOR',
        priority: 'MEDIUM'
      };
    }

    // Validation errors
    if (message.includes('validation') || message.includes('invalid') ||
        message.includes('required') || errorType === 'ValidationError') {
      return {
        category: 'validation',
        suggestion: 'Add or fix input validation. Check request payload format.',
        action: 'LOG_AND_IGNORE',
        priority: 'LOW'
      };
    }

    // Memory errors
    if (message.includes('memory') || message.includes('heap') ||
        message.includes('allocation')) {
      return {
        category: 'memory',
        suggestion: 'Optimize memory usage. Consider increasing heap size or fixing memory leaks.',
        action: 'FORCE_GC',
        priority: 'HIGH'
      };
    }

    // Network errors
    if (message.includes('enotfound') || message.includes('network') ||
        message.includes('dns') || message.includes('socket')) {
      return {
        category: 'network',
        suggestion: 'Check network connectivity and DNS resolution.',
        action: 'RETRY_WITH_BACKOFF',
        priority: 'MEDIUM'
      };
    }

    // File system errors
    if (message.includes('enoent') || message.includes('file') ||
        message.includes('permission denied') || message.includes('eacces')) {
      return {
        category: 'filesystem',
        suggestion: 'Verify file paths and permissions.',
        action: 'LOG_ONLY',
        priority: 'MEDIUM'
      };
    }

    // Syntax/Type errors (likely bugs)
    if (errorType === 'TypeError' || errorType === 'SyntaxError' ||
        errorType === 'ReferenceError') {
      const userFrame = frames.find(f => f.isUserCode);
      return {
        category: 'bug',
        suggestion: userFrame
          ? `Fix code at ${userFrame.file}:${userFrame.line}`
          : 'Fix the code error. This appears to be a bug.',
        action: 'LOG_AND_ALERT',
        priority: 'HIGH',
        location: userFrame ? `${userFrame.file}:${userFrame.line}` : null
      };
    }

    return {
      category: 'unknown',
      suggestion: 'Review stack trace for root cause.',
      action: 'LOG_ONLY',
      priority: 'LOW'
    };
  }

  /**
   * Genere un diagnostic complet
   */
  diagnose(error) {
    const analysis = this.analyze(error);

    return {
      summary: `${analysis.errorType}: ${analysis.message}`,
      location: analysis.rootFile || 'unknown',
      category: analysis.suggestedFix.category,
      isLibraryError: analysis.isNodeModules && !analysis.isUserCode,
      isUserCodeError: analysis.isUserCode,
      recommendation: analysis.suggestedFix.suggestion,
      suggestedAction: analysis.suggestedFix.action,
      priority: analysis.suggestedFix.priority,
      stackDepth: analysis.stackDepth,
      topFrame: analysis.topFrame,
      fullAnalysis: analysis
    };
  }

  /**
   * Compare deux erreurs pour voir si elles sont similaires
   */
  areSimilar(error1, error2) {
    const analysis1 = this.analyze(error1);
    const analysis2 = this.analyze(error2);

    // Meme type et meme fichier racine = similaire
    if (analysis1.errorType === analysis2.errorType &&
        analysis1.rootFile === analysis2.rootFile) {
      return true;
    }

    // Meme message (sans numeros) = similaire
    const normalizeMessage = (msg) => msg.replace(/\d+/g, 'N').toLowerCase();
    if (normalizeMessage(analysis1.message) === normalizeMessage(analysis2.message)) {
      return true;
    }

    return false;
  }

  /**
   * Extrait le contexte du code autour de l'erreur
   */
  getCodeContext(analysis) {
    if (!analysis.topFrame || !analysis.topFrame.isUserCode) {
      return null;
    }

    return {
      file: analysis.topFrame.file,
      function: analysis.topFrame.function,
      line: analysis.topFrame.line,
      column: analysis.topFrame.column
    };
  }
}

// Singleton
const stackTraceAnalyzer = new StackTraceAnalyzer();
export { stackTraceAnalyzer };
export default stackTraceAnalyzer;
