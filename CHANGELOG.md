# Changelog

## [0.7.2](https://github.com/apm-js-collab/code-transformer-bundler-plugins/compare/code-transformer-bundler-plugins-v0.7.1...code-transformer-bundler-plugins-v0.7.2) (2026-07-21)


### Bug Fixes

* Broken TypeScript declarations ([#41](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/41)) ([8dffa5b](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/8dffa5baef85e083e0d589bf25e15ec0258ebe0a))

## [0.7.1](https://github.com/apm-js-collab/code-transformer-bundler-plugins/compare/code-transformer-bundler-plugins-v0.7.0...code-transformer-bundler-plugins-v0.7.1) (2026-07-16)


### Bug Fixes

* Make subpath types resolvable under TypeScript node10 module resolution ([#38](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/38)) ([82d208e](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/82d208e86c8b8d9f15275e1eba50ca061fcc3a60))

## [0.7.0](https://github.com/apm-js-collab/code-transformer-bundler-plugins/compare/code-transformer-bundler-plugins-v0.6.2...code-transformer-bundler-plugins-v0.7.0) (2026-07-16)


### Features

* Pass though custom transforms ([#36](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/36)) ([fda2c55](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/fda2c5505d1bfca13283468f290af237943983ad))

## [0.6.2](https://github.com/apm-js-collab/code-transformer-bundler-plugins/compare/code-transformer-bundler-plugins-v0.6.1...code-transformer-bundler-plugins-v0.6.2) (2026-07-15)


### Bug Fixes

* Turbopack regex matching ([#34](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/34)) ([9638d14](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/9638d14207eb45b398c4588088f17fd6cc44dcd3))

## [0.6.1](https://github.com/apm-js-collab/code-transformer-bundler-plugins/compare/code-transformer-bundler-plugins-v0.6.0...code-transformer-bundler-plugins-v0.6.1) (2026-07-15)


### Bug Fixes

* Remove unnecessary warning ([#30](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/30)) ([fc63cd0](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/fc63cd0be2e1bc4c046dd8b7acee405e7e5d59a2))


### Performance Improvements

* filter transform hook to `node_modules` by default ([#29](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/29)) ([b85a8bf](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/b85a8bf3fc218be1ea2ae4a95357dfb5322fd840))

## [0.6.0](https://github.com/apm-js-collab/code-transformer-bundler-plugins/compare/code-transformer-bundler-plugins-v0.5.0...code-transformer-bundler-plugins-v0.6.0) (2026-07-10)


### Features

* Update orchestrion to v0.18.0 ([#27](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/27)) ([a392ab0](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/a392ab0fed16664195e52af90137b852d0dad7f9))


### Bug Fixes

* `injectDiagnostics` should only inject into entry points ([#26](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/26)) ([f93feac](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/f93feac0bab41bf0eaf73c278bb3878183617c43))

## [0.5.0](https://github.com/apm-js-collab/code-transformer-bundler-plugins/compare/code-transformer-bundler-plugins-v0.4.0...code-transformer-bundler-plugins-v0.5.0) (2026-06-18)


### Features

* Improve esm/cjs detection ([#22](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/22)) ([cc17e6c](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/cc17e6c2d0f4200997f5f29911c351bfe59088fc))


### Bug Fixes

* Sourcemap pass through with Roll{up,down}/Vite ([#24](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/24)) ([7e06293](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/7e06293960e8fd045f451879ff45c8caafc5ab12))

## [0.4.0](https://github.com/apm-js-collab/code-transformer-bundler-plugins/compare/code-transformer-bundler-plugins-v0.3.0...code-transformer-bundler-plugins-v0.4.0) (2026-06-15)


### Features

* Optionally inject hook diagnostics ([#19](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/19)) ([4607691](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/46076917a3a48c8eea73783e2faa59764c57acba))

## [0.3.0](https://github.com/apm-js-collab/code-transformer-bundler-plugins/compare/code-transformer-bundler-plugins-v0.2.4...code-transformer-bundler-plugins-v0.3.0) (2026-05-25)


### Features

* bun support ([#18](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/18)) ([232247c](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/232247c7dd9eadfb85dc160e1a727ebc4d1ea0f3))
* remove unplugin dependency ([#15](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/15)) ([7a3ab7e](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/7a3ab7e419e1ec76ad7cfd96a10c41ff33ecff90))


### Bug Fixes

* No need to free resources ([#17](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/17)) ([bf1d141](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/bf1d141dea31ef7495ec086118b4690ba4a5cb2e))

## [0.2.4](https://github.com/apm-js-collab/code-transformer-bundler-plugins/compare/code-transformer-bundler-plugins-v0.2.3...code-transformer-bundler-plugins-v0.2.4) (2026-05-22)


### Bug Fixes

* build with Vite so dist filenames match package.json exports ([#13](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/13)) ([f9bbac5](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/f9bbac5c443bf7ee180ee6025163d20f54a4f218))

## [0.2.3](https://github.com/apm-js-collab/code-transformer-bundler-plugins/compare/code-transformer-bundler-plugins-v0.2.2...code-transformer-bundler-plugins-v0.2.3) (2026-05-21)


### Bug Fixes

* Another build failure ([#11](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/11)) ([e81873b](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/e81873bae06eac0fcbe6f170add3391361e3b41f))

## [0.2.2](https://github.com/apm-js-collab/code-transformer-bundler-plugins/compare/code-transformer-bundler-plugins-v0.2.1...code-transformer-bundler-plugins-v0.2.2) (2026-05-21)


### Bug Fixes

* Build before publish ([#9](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/9)) ([4c0635d](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/4c0635d2a8676da680fa1738f3fdb3cbd8d743d4))

## [0.2.1](https://github.com/apm-js-collab/code-transformer-bundler-plugins/compare/code-transformer-bundler-plugins-v0.2.0...code-transformer-bundler-plugins-v0.2.1) (2026-05-21)


### Bug Fixes

* `repository.url` should be set for publish provenance ([#7](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/7)) ([0fd9022](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/0fd9022ea7a0deef3b858cd047dac016438d1271))

## [0.2.0](https://github.com/apm-js-collab/code-transformer-bundler-plugins/compare/code-transformer-bundler-plugins-v0.1.0...code-transformer-bundler-plugins-v0.2.0) (2026-05-21)


### Features

* Update `@apm-js-collab/code-transformer` to `^0.13.0` ([#2](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/2)) ([79e90c1](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/79e90c1030f31ff528e822a46a39d1a78b10f041))


### Bug Fixes

* Broken webpack loader after dependency update ([#6](https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/6)) ([d964e12](https://github.com/apm-js-collab/code-transformer-bundler-plugins/commit/d964e12aa3ae7f149ad75398f4ba0e318a8e4b4e))
