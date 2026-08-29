const { withSettingsGradle, withAppBuildGradle, withMainApplication } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');
const { addImports } = require('@expo/config-plugins/build/android/codeMod');

// WatermelonDB ships a second native Android module ("android-jsi") that
// exposes the JSI SQLiteAdapter bridge, but its own react-native.config.js
// only autolinks the async bridge module ("./native/android"). Without this
// plugin, `jsi: true` in database/watermelon/database.ts silently falls back
// to the async bridge on every boot. See task brief for the full trace.
//
// This plugin performs the three manual-linking steps documented for
// libraries with a similar "second native module needs manual linking"
// problem: register an extra Gradle module, add it as an app dependency, and
// register its ReactPackage in MainApplication.

const GRADLE_MODULE_NAME = ':watermelondb-jsi';
const GRADLE_SOURCE_DIR = '../node_modules/@nozbe/watermelondb/native/android-jsi';
const JSI_PACKAGE_FQN = 'com.nozbe.watermelondb.jsi.WatermelonDBJSIPackage';
const JSI_PACKAGE_CLASS = 'WatermelonDBJSIPackage';

function withWatermelonJsiSettingsGradle(config) {
  return withSettingsGradle(config, (config) => {
    const merged = mergeContents({
      src: config.modResults.contents,
      newSrc: [
        `include '${GRADLE_MODULE_NAME}'`,
        `project('${GRADLE_MODULE_NAME}').projectDir = new File(rootProject.projectDir, '${GRADLE_SOURCE_DIR}')`,
      ].join('\n'),
      tag: 'watermelondb-jsi-settings',
      anchor: /include ':app'/,
      offset: 1,
      comment: '//',
    });
    config.modResults.contents = merged.contents;
    return config;
  });
}

function withWatermelonJsiAppBuildGradle(config) {
  return withAppBuildGradle(config, (config) => {
    const merged = mergeContents({
      src: config.modResults.contents,
      newSrc: `    implementation project('${GRADLE_MODULE_NAME}')`,
      tag: 'watermelondb-jsi-dependency',
      anchor: /^dependencies \{$/,
      offset: 1,
      comment: '    //',
    });
    config.modResults.contents = merged.contents;
    return config;
  });
}

function withWatermelonJsiMainApplication(config) {
  return withMainApplication(config, (config) => {
    const { modResults } = config;
    const isJava = modResults.language === 'java';

    const contentsWithImport = addImports(modResults.contents, [JSI_PACKAGE_FQN], isJava);

    const merged = mergeContents({
      src: contentsWithImport,
      newSrc: isJava
        ? `            packages.add(new ${JSI_PACKAGE_CLASS}());`
        : `              add(${JSI_PACKAGE_CLASS}())`,
      tag: 'watermelondb-jsi-package',
      anchor: isJava
        ? /List<ReactPackage> packages = new PackageList\(this\)\.getPackages\(\);/
        : /PackageList\(this\)\.packages\.apply \{/,
      offset: 1,
      comment: '            //',
    });
    modResults.contents = merged.contents;
    return config;
  });
}

module.exports = function withWatermelonJsi(config) {
  config = withWatermelonJsiSettingsGradle(config);
  config = withWatermelonJsiAppBuildGradle(config);
  config = withWatermelonJsiMainApplication(config);
  return config;
};
