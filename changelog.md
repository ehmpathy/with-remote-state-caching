# Changelog

### [1.3.2](https://www.github.com/ehmpathy/with-remote-state-caching/compare/v1.3.1...v1.3.2) (2022-11-25)


### Bug Fixes

* **deps:** upgrade depenedency on type fns ([7201a41](https://www.github.com/ehmpathy/with-remote-state-caching/commit/7201a41558536149ff41c2b501016bd660d17a61))

### [1.3.1](https://www.github.com/ehmpathy/with-remote-state-caching/compare/v1.3.0...v1.3.1) (2022-11-25)


### Bug Fixes

* **types:** fix stragler type def ([aef4e58](https://www.github.com/ehmpathy/with-remote-state-caching/commit/aef4e586bfafe89a32e0e242a329d0ffce98fb9d))

## [1.3.0](https://www.github.com/ehmpathy/with-remote-state-caching/compare/v1.2.0...v1.3.0) (2022-11-25)


### Features

* **cache:** better restrict acceptable type of RemoteStateCache; add default serde at context level ([a15fd1e](https://www.github.com/ehmpathy/with-remote-state-caching/commit/a15fd1e52d3b08c4d598bd29a3999aaaea9e4062))

## [1.2.0](https://www.github.com/ehmpathy/with-remote-state-caching/compare/v1.1.0...v1.2.0) (2022-11-25)


### Features

* **context:** allow user to specify default (de)serialization at context level ([94efac8](https://www.github.com/ehmpathy/with-remote-state-caching/commit/94efac8d00fb27b766b2b964512680afdb134cd4))

## [1.1.0](https://www.github.com/ehmpathy/with-remote-state-caching/compare/v1.0.1...v1.1.0) (2022-11-24)


### Features

* **context:** allow specifying default key serialization method at context level ([767b7ce](https://www.github.com/ehmpathy/with-remote-state-caching/commit/767b7ce993c8768d809b7edf90207cd6cd6eb4d9))

### [1.0.1](https://www.github.com/ehmpathy/with-remote-state-caching/compare/v1.0.0...v1.0.1) (2022-11-24)


### Bug Fixes

* **exports:** actually export the utilities ([0c2eb89](https://www.github.com/ehmpathy/with-remote-state-caching/commit/0c2eb8966cf96adc98a03b4a819a52075b531751))

## 1.0.0 (2022-11-24)


### Features

* **context:** define cache at context level, to ensure all fns share same cache for interactions ([5cf727b](https://www.github.com/ehmpathy/with-remote-state-caching/commit/5cf727b380a4daeeca2b69945ec341e623dcd95f))
* **init:** with-remote-state-caching working for query caching ([d74288d](https://www.github.com/ehmpathy/with-remote-state-caching/commit/d74288d5b494d589884c9c58cc16bb8520a89b3d))
* **triggers:** support adding invalidation and update triggers to queries ([565f1dd](https://www.github.com/ehmpathy/with-remote-state-caching/commit/565f1ddf0623abf04a6021efc36064a5d47df5c3))


### Bug Fixes

* **triggers:** get valid keys of cache directly from cache ([9283643](https://www.github.com/ehmpathy/with-remote-state-caching/commit/9283643238b401e3536b6a2e52e64d474396e82e))
