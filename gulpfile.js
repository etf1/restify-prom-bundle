"use strict"

const gulp = require('gulp');
const clean = require('gulp-clean');
const clone = require('gulp-clone');
const istanbul = require('gulp-istanbul');
const mocha = require('gulp-mocha');
const sourcemaps = require('gulp-sourcemaps');
const gsync = require('gulp-sync')(gulp);
const gulpTslint = require('gulp-tslint');
const ts = require('gulp-typescript');
const gutil = require('gulp-util');

const spawn = require('child_process').spawn;
const fs = require('fs');
const merge = require('merge2');
const path = require('path');
const tslint = require('tslint');
const remapIstanbul = require('remap-istanbul/lib/gulpRemapIstanbul');

const libTs = ts.createProject(
  'tsconfig.json',
  {
    declaration: true,
  }
);

const testTs = ts.createProject('tsconfig.json');

/**
 * Clean built files.
 */
gulp.task('clean:lib',
  () => gulp.src(
    [
      'built/*',
      '!built/.gitkeep',
    ],
    { read: false }
  )
    .pipe(clean())
);

gulp.task('clean:test',
  () => gulp.src(
    [
      'test/**/*.js',
    ],
    { read: false }
  )
    .pipe(clean())
);

gulp.task('clean:coverage',
  () => gulp.src(
    [
      'coverage/*',
    ],
    { read: false }
  )
    .pipe(clean())
);

/**
 * Run TSLint.
 */
gulp.task('tslint', () => {
  const program = tslint.Linter.createProgram('./tsconfig.json');

  return gulp.src('src/**/*.ts')
    .pipe(
      gulpTslint({
        formatter: 'verbose',
        program,
      })
    )
    .pipe(gulpTslint.report({
      emitError: !!process.env.STRICT_LINT,
    }));
});

/**
 * Compile TS.
 */
gulp.task('typescript:lib',
  () => {
    const tsResult = libTs.src()
      .pipe(sourcemaps.init({
        loadMaps: true,
        identityMap: true,
      }))
      .pipe(libTs());
    const clonedStream = tsResult.js.pipe(clone());

    return merge([
      tsResult.dts.pipe(gulp.dest('built/definitions')),
      tsResult.js.pipe(gulp.dest('built/js')),
      clonedStream.pipe(sourcemaps.write({
        includeContent: false,
        mapSources: (sourcePath) => path.resolve(__dirname, 'src', sourcePath),
      })).pipe(gulp.dest('built/map'))
    ]);
  });

gulp.task('typescript:test',
  () => gulp.src('test/**/*.ts')
    .pipe(sourcemaps.init({
      loadMaps: true,
      identityMap: true,
    }))
    .pipe(testTs())
    .pipe(sourcemaps.write({
      includeContent: false,
      mapSources: (sourcePath) => path.resolve(__dirname, 'test', sourcePath),
    }))
    .pipe(gulp.dest('test'))
);

/**
 * Run tests.
 */

gulp.task('test:workflow',
  gsync.sync([
    ['clean:test', 'clean:coverage'],
    'typescript:test',
    'test:prepare',
    'test:mocha',
    'test:remap',
    'test:showSummary'
  ])
);


gulp.task('test:prepare',
  () => gulp.src(['test/**/*.js', 'built/map/**/*.js'])
    .pipe(istanbul())
    .pipe(istanbul.hookRequire())
);

gulp.task('test:mocha',
  () => {
    process.env.NODE_ENV = 'test';
    return gulp.src('test/**/*.js', {read: false})
      .pipe(mocha({reporter: 'spec'}))
      .pipe(istanbul.writeReports({
        dir: './coverage',
        reporters: ['json'],
        reportOpts: {
          json: {
            file: './coverage/coverage-unmapped.json',
          },
        },
      }));
  }
);

gulp.task('test:remap',
  () => gulp.src('./coverage/coverage-unmapped.json')
    .pipe(remapIstanbul({
      basePath: path.resolve(__dirname, 'src'),
      exclude: /^test/,
      reports: {
        'json': './coverage/coverage.json',
        'html': './coverage/html-report',
        'text-summary': './coverage/summary',
      }
    }))
);

gulp.task('test:showSummary',
  (done) => {
    const file = path.resolve(__dirname, 'coverage', 'summary');
    fs.stat(file, (err, stats) => {
      if (err || !stats.isFile()) {
        return done();
      }
      fs.readFile(file, (err, buffer) => {
        if (err) {
          return done(err);
        }
        gutil.log(buffer.toString('utf-8'));
        done();
      });
    })
  });


/**
 * (Re)Launch server.
 */
let nodeProcess;
gulp.task(
  'server',
  ['tslint', 'typescript:lib'],
  () => {
    if (nodeProcess) {
      gutil.log('REstarting server');
      nodeProcess.kill();
    }
    nodeProcess = spawn(
      process.execPath,
      [
        './built/js/index.js'
      ],
      {
        stdio: 'inherit',
      }
    );
    nodeProcess.on('close', code => {
      if (code === 8) {
        gutil.log(new Error('Error detected, waiting for changes...'));
      }
    });
    nodeProcess.on('error', (err) => gutil.log(err));
  }
);

process.on('exit', () => {
  if (nodeProcess) {
    nodeProcess.kill();
  }
});

/**
 * Watch mode.
 */
gulp.task(
  'watch',
  gsync.sync(['clean:lib', 'server']),
  function () {
    gulp.watch(['src/**/*.ts', 'definitions/**/*.d.ts'], ['server']);
  }
);

/**
 * Shorthands.
 */
gulp.task('clean', gsync.sync([['clean:lib', 'clean:test', 'clean:coverage']]));
gulp.task('build', gsync.sync(['clean', ['tslint', 'typescript:lib']]));
gulp.task('test', gsync.sync(['build', 'test:workflow']));
