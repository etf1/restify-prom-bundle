var gulp = require('gulp');
var clean = require('gulp-clean');
var clone = require('gulp-clone');
var istanbul = require('gulp-istanbul');
var mocha = require('gulp-mocha');
var sourcemaps = require('gulp-sourcemaps');
var gsync = require('gulp-sync')(gulp);
var tslint = require('gulp-tslint');
var gutil = require('gulp-util');
var ts = require('gulp-typescript');

var fs = require('fs');
var merge = require('merge2');
var path = require('path');
var remapIstanbul = require('remap-istanbul/lib/gulpRemapIstanbul');

var libTs = ts.createProject(
  'tsconfig.json',
  {
    declaration: true,
  }
);

var testTs = ts.createProject('tsconfig.json');

/**
 * Clean built files.
 */
gulp.task('clean:lib',
  function() {
    return gulp.src(
      [
        'built/*',
        '!built/.gitkeep',
      ],
      { read: false }
    )
      .pipe(clean());
  }
);

gulp.task('clean:test',
  function() {
    return gulp.src(
      [
        'test/**/*.js',
      ],
      {read: false}
    )
      .pipe(clean());
  }
);

gulp.task('clean:coverage',
  function() {
    return gulp.src(
      [
        'coverage/*',
      ],
      { read: false }
    )
      .pipe(clean());
  }
);

/**
 * Run TSLint.
 */
gulp.task('tslint',
  function() {
    return gulp.src('src/**/*.ts')
      .pipe(
        tslint({
          formatter: 'verbose',
          rulesDirectory: 'node_modules/tslint-microsoft-contrib',
          configuration: require('./tslint.json'),
        })
      )
      .pipe(tslint.report({
        emitError: !!process.env.STRICT_LINT,
      }));
  }
);

/**
 * Compile TS.
 */
gulp.task('typescript:lib',
  function() {
    var tsResult = libTs.src()
        .pipe(sourcemaps.init({
          loadMaps: true,
          identityMap: true,
        }))
        .pipe(libTs());
    var clonedStream = tsResult.js.pipe(clone());

    return merge([
      tsResult.dts.pipe(gulp.dest('built/definitions')),
      tsResult.js.pipe(gulp.dest('built/js')),
      clonedStream.pipe(sourcemaps.write({
        includeContent: false,
        mapSources: function(sourcePath) { return path.resolve(__dirname, 'src', sourcePath); },
      })).pipe(gulp.dest('built/map'))
    ]);
  }
);

gulp.task('typescript:test',
  function() {
    return gulp.src('test/**/*.ts')
      .pipe(sourcemaps.init({
        loadMaps: true,
        identityMap: true,
      }))
      .pipe(testTs())
      .pipe(sourcemaps.write({
        includeContent: false,
        mapSources: function (sourcePath) { return path.resolve(__dirname, 'test', sourcePath); },
      }))
      .pipe(gulp.dest('test'));
  }
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
  function() {
    return gulp.src(['test/**/*.js', 'built/map/**/*.js'])
      .pipe(istanbul())
      .pipe(istanbul.hookRequire());
  }
);

gulp.task('test:mocha',
  function() {
    return gulp.src('test/**/*.js', {read: false})
      .pipe(mocha({reporter: 'spec'}))
      .pipe(istanbul.writeReports({
        dir: './coverage',
        reporters: [ 'json' ],
        reportOpts: {
          json: {
            file: './coverage/coverage-unmapped.json',
          },
        },
      }));
  }
);

gulp.task('test:remap',
  function() {
    return gulp.src('./coverage/coverage-unmapped.json')
      .pipe(remapIstanbul({
        basePath: path.resolve(__dirname, 'src'),
        exclude: /^test/,
        reports: {
          'json': './coverage/coverage.json',
          'html': './coverage/html-report',
          'text-summary': './coverage/summary',
        }
      }));
  }
);

gulp.task('test:showSummary',
  function(done) {
    var file = path.resolve(__dirname, 'coverage', 'summary');
    fs.stat(file, function (err, stats) {
      if (err || !stats.isFile()) {
        return done();
      }
      fs.readFile(file, function (err, buffer) {
        if (err) {
          return done(err);
        }
        gutil.log(buffer.toString('utf-8'));
        done();
      });
    });
  }
);

/**
 * Watch mode.
 */
gulp.task('watch',
  gsync.sync([['clean', 'tslint'], 'typescript:lib']),
  function () {
    gulp.watch(['src/**/*.ts'], ['typescript:lib', 'tslint']);
  }
);

/**
 * Shorthands.
 */
gulp.task('clean', gsync.sync([['clean:lib', 'clean:test', 'clean:coverage']]));
gulp.task('build', gsync.sync(['clean', ['tslint', 'typescript:lib']]));
gulp.task('test', gsync.sync(['build', 'test:workflow']));
