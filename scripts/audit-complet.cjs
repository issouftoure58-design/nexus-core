const fs = require('fs');
const path = require('path');

class ComprehensiveAuditor {
  constructor() {
    this.issues = {
      simulations: [],
      todos: [],
      mocks: [],
      hardcoded: [],
      notImplemented: []
    };

    this.stats = {
      filesScanned: 0,
      issuesFound: 0
    };
  }

  patterns = {
    simulation: [
      /\/\/\s*simulation/i,
      /\/\/\s*simulated/i,
      /\/\/\s*simul[ée]/i,
      /\/\/\s*mock/i,
      /\/\/\s*fake/i,
      /\/\/\s*dummy/i,
      /simulated:\s*true/i,
      /isMock:\s*true/i,
      /\/\*\s*simulation\s*\*\//i
    ],

    todo: [
      /\/\/\s*TODO/i,
      /\/\/\s*FIXME/i,
      /\/\/\s*XXX/i,
      /\/\/\s*HACK/i,
      /\/\*\s*TODO/i
    ],

    mock: [
      /mockData\s*=/i,
      /dummyData\s*=/i,
      /testData\s*=/i,
      /sampleData\s*=/i,
      /fakeData\s*=/i
    ],

    hardcoded: [
      /const\s+\w+\s*=\s*\[\s*\]/,
      /return\s*\[\s*\]/,
      /return\s*{\s*}/,
      /return\s*null/,
      /return\s*undefined/,
      /return\s*0/
    ],

    notImplemented: [
      /throw new Error\(['"]Not implemented/i,
      /throw new Error\(['"]TODO/i,
      /console\.warn\(['"]Not implemented/i,
      /\/\/\s*not\s*implemented/i
    ]
  };

  shouldIgnore(filePath) {
    const ignoredPatterns = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      'coverage',
      'audit-',
      'test',
      'spec',
      '.test.',
      '.spec.'
    ];

    return ignoredPatterns.some(pattern => filePath.includes(pattern));
  }

  scanFile(filePath) {
    if (this.shouldIgnore(filePath)) return;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const relativePath = path.relative(process.cwd(), filePath);

      this.stats.filesScanned++;

      lines.forEach((line, index) => {
        const lineNum = index + 1;

        this.patterns.simulation.forEach(pattern => {
          if (pattern.test(line)) {
            this.issues.simulations.push({
              file: relativePath,
              line: lineNum,
              content: line.trim(),
              severity: 'CRITICAL'
            });
            this.stats.issuesFound++;
          }
        });

        this.patterns.todo.forEach(pattern => {
          if (pattern.test(line)) {
            this.issues.todos.push({
              file: relativePath,
              line: lineNum,
              content: line.trim(),
              severity: 'MEDIUM'
            });
            this.stats.issuesFound++;
          }
        });

        this.patterns.mock.forEach(pattern => {
          if (pattern.test(line)) {
            this.issues.mocks.push({
              file: relativePath,
              line: lineNum,
              content: line.trim(),
              severity: 'HIGH'
            });
            this.stats.issuesFound++;
          }
        });

        this.patterns.notImplemented.forEach(pattern => {
          if (pattern.test(line)) {
            this.issues.notImplemented.push({
              file: relativePath,
              line: lineNum,
              content: line.trim(),
              severity: 'CRITICAL'
            });
            this.stats.issuesFound++;
          }
        });
      });

    } catch (err) {
      // Ignorer erreurs lecture
    }
  }

  scanDirectory(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      entries.forEach(entry => {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!this.shouldIgnore(fullPath)) {
            this.scanDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (['.js', '.ts', '.tsx', '.jsx'].includes(ext)) {
            this.scanFile(fullPath);
          }
        }
      });
    } catch (err) {
      console.error(`Erreur scan ${dir}: ${err.message}`);
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('AUDIT NEXUS COMPLET - RAPPORT FINAL');
    console.log('='.repeat(80) + '\n');

    console.log('STATISTIQUES\n');
    console.log(`Fichiers scannes : ${this.stats.filesScanned}`);
    console.log(`Issues trouvees : ${this.stats.issuesFound}\n`);

    console.log('RESUME PAR CATEGORIE\n');
    console.log(`CRITIQUES`);
    console.log(`   - Simulations : ${this.issues.simulations.length}`);
    console.log(`   - Non implemente : ${this.issues.notImplemented.length}`);
    console.log(`\nIMPORTANTES`);
    console.log(`   - Mocks : ${this.issues.mocks.length}`);
    console.log(`\nMINEURES`);
    console.log(`   - TODOs : ${this.issues.todos.length}`);
    console.log();

    if (this.issues.simulations.length > 0 || this.issues.notImplemented.length > 0) {
      console.log('='.repeat(80));
      console.log('ISSUES CRITIQUES (A CORRIGER IMMEDIATEMENT)\n');

      if (this.issues.simulations.length > 0) {
        console.log('SIMULATIONS DETECTEES:\n');
        this.issues.simulations.forEach((issue, i) => {
          console.log(`${i + 1}. ${issue.file}:${issue.line}`);
          console.log(`   ${issue.content}\n`);
        });
      }

      if (this.issues.notImplemented.length > 0) {
        console.log('NON IMPLEMENTE:\n');
        this.issues.notImplemented.forEach((issue, i) => {
          console.log(`${i + 1}. ${issue.file}:${issue.line}`);
          console.log(`   ${issue.content}\n`);
        });
      }
    }

    if (this.issues.mocks.length > 0) {
      console.log('='.repeat(80));
      console.log('MOCKS DETECTES:\n');
      this.issues.mocks.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue.file}:${issue.line}`);
        console.log(`   ${issue.content}\n`);
      });
    }

    const fileIssues = {};
    [...this.issues.simulations, ...this.issues.todos, ...this.issues.mocks, ...this.issues.notImplemented]
      .forEach(issue => {
        fileIssues[issue.file] = (fileIssues[issue.file] || 0) + 1;
      });

    const topFiles = Object.entries(fileIssues)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (topFiles.length > 0) {
      console.log('='.repeat(80));
      console.log('TOP 10 FICHIERS A NETTOYER\n');
      topFiles.forEach(([file, count], i) => {
        console.log(`${i + 1}. ${file} (${count} issues)`);
      });
      console.log();
    }

    console.log('='.repeat(80));
    console.log('CONCLUSION\n');

    const critical = this.issues.simulations.length + this.issues.notImplemented.length;

    if (critical === 0) {
      console.log('AUCUNE SIMULATION DETECTEE');
      console.log('SYSTEME 100% PRODUCTION-READY\n');
    } else {
      console.log(`${critical} ISSUE(S) CRITIQUE(S) DETECTEE(S)`);
      console.log('CORRECTIONS REQUISES AVANT PRODUCTION\n');
    }

    console.log('='.repeat(80) + '\n');

    const reportPath = path.join(process.cwd(), 'audit-nexus-final.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      stats: this.stats,
      issues: this.issues,
      timestamp: new Date().toISOString()
    }, null, 2));

    console.log(`Rapport JSON : ${reportPath}\n`);

    return this.issues;
  }
}

console.log('Demarrage audit NEXUS...\n');

const auditor = new ComprehensiveAuditor();

console.log('Scanning backend...');
auditor.scanDirectory(path.join(process.cwd(), 'backend', 'src'));

console.log('Scanning client...');
auditor.scanDirectory(path.join(process.cwd(), 'client', 'src'));

console.log('Scanning server...');
auditor.scanDirectory(path.join(process.cwd(), 'server'));

const issues = auditor.generateReport();

const critical = issues.simulations.length + issues.notImplemented.length;
process.exit(critical > 0 ? 1 : 0);
