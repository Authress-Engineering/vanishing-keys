# Authress OTS: One Time Secret

This is the public completely **open source** implementation of how Authress provides the One Time Secret service.

## [Create a Secret](https://authress.io/app/#/ots)

## How it works
* Enter your secret at [Authress One Time Secret](https://authress.io/app/#/ots)
* OTS encrypts your secret on the UI side using a passphrase.
* The encrypted data is sent to OTS service
* Share the generated link with the intended party
* They use the shared passphrase to decrypt the secret

## One time use
* Once the encrypted data is fetched it is immediately deleted from Authress OTS. This prevent future Quantum attacks against your credentials.
* Since only the encrypted data is sent to Authress OTS, no one running the service can decrypt the data even if they wanted to. At no point is the data available

![image](https://github.com/Authress/one-time-secret/assets/5056218/eabe5a13-3e40-4741-9c4a-52cd548abf95)

## Components
OTS is broken down into two parts:
* [UI](https://github.com/Authress/ots-webcomponent.js) - which is a webcomponent. Authress hosts this webcomponent at [Authress One Time Secret](https://authress.io/app/#/ots).
* [OTS microservice](https://github.com/Authress/one-time-secret) - The secure microservice which runs OTS.
