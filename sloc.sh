#!/usr/bin/env bash
wc -l $(git ls-files '*.js' ; git ls-files '*.html' ; git ls-files '*.4st' )
