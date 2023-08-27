#!/usr/bin/env node

const fs = require("fs");

function match(ch, patterns) {
	for (const p of patterns) {
		if (p.length === 1) {
			if (ch === p[0]) return true;
		} else if (p.length === 2) {
			if (p[0] <= ch && ch <= p[1]) return true;
		} else {
			throw new Error("bad pattern: " + JSON.stringify(p));
		}
	}
	return false;
}

const one_of = (ch, chars) => chars.indexOf(ch) >= 0;

const WHITESPACE = " \t\n\r";

function open(path) {
	const source = fs.readFileSync(path, {"encoding": "utf8"});
	let line = 1;
	let cursor_mark;
	let cursor = 0;
	let cursor_at_beginning_of_line = cursor;

	function get() {
		const ch = source[cursor++];
		if (ch === "\n") {
			line++;
			cursor_at_beginning_of_line = cursor;
		}
		return ch;
	}

	function unget() {
		cursor--;
		if (cursor < 0) throw new Error("unget to negative position");
	}

	function eat_while_match(pattern) {
		while (match(get(), pattern)) {};
		cursor--;
		return source.slice(cursor_mark, cursor);
	}

	function skip_whitespace() {
		while (one_of(get(), WHITESPACE)) {};
		cursor--;
	}

	function skip_until_match_one_of(chars) {
		while (!one_of(get(), chars)) {};
	}

	const get_pos = () => "line " + line + ", column " + (cursor - cursor_at_beginning_of_line);
	function warn(msg) { console.warn("WARNING at " + get_pos() + ": " + msg); };
	function error(msg) { throw new Error("at " + get_pos() + ": " + msg); };
	function mark() { cursor_mark = cursor; }

	return { get, unget, mark, eat_while_match, skip_whitespace, skip_until_match_one_of, error, warn };
}


function process_songlist_file(path) {
	const src = open(path);
	// TODO
}

function process_au_file(path) {
	const src = open(path);
	// TODO
}

function process_4st_file(path) {
	const src = open(path);

	const new_scope = () => ({
		words: {},
		tokens: [],
	});

	let scope = new_scope(null);
	scope.tokens = null; // throw error if code attempts to push tokens onto top-level scope
	let scope_stack = [scope];

	let handle_defword = false;

	const WORD="word", NUMBER="number", OP="op";

	function push_token(t, a) {
		if (scope_stack.length < 2 && t !== DEFWORD) src.error("only word definitions (\":<word>\") are allowed at the top level");
		if (handle_defword) {
			if (t !== WORD) src.error("expected WORD");
			scope_stack[scope_stack.length-2].words[a] = scope;
			handle_defword = false;
		} else {
			scope.tokens.push([t, a]);
		}
	}

	function enter_scope() {
		scope = new_scope();
		scope_stack.push(scope);
	}

	function leave_scope() {
		if (scope_stack.length === 0) src.error("left top-level scope");
		scope_stack.pop();
		scope = scope_stack[scope_stack.length-1];
	}

	function enter_word_definition() {
		handle_defword = true;
		enter_scope();
	}

	function leave_word_definition() {
		leave_scope();
	}

	for (;;) {
		src.skip_whitespace();
		src.mark();
		const ch = src.get();
		if (ch === undefined) {
			break;
		} else if /*word*/ (match(ch, ["az"])) {
			const word = src.eat_while_match(["az","09","_"]);
			push_token(WORD, word);
		} else if /*number (octal)*/ (match(ch, ["07","-","."])) {
			// XXX number parser should be better:
			//  - if "-" doesn't come after "e", consider it to be
			//    the next token?
			const number = src.eat_while_match(["07","-",".","e",":"]);
			push_token(NUMBER, number);
		} else if /*word definition*/ (ch === ":") {
			enter_word_definition();
		} else if /*end of word definition (implicit return)*/ (ch === ";") {
			leave_word_definition();
		} else if /*1-char op*/  (one_of(ch, "+-*/%^&")) {
			push_token(OP, ch);
		} else if /*comment*/ (ch === "(") {
			src.skip_until_match_one_of(")");
		} else {
			src.error("unexpected character");
		}
	}

	if (scope_stack.length !== 1) src.error("word definition was not terminated");

	//console.log(tokens); // TODO
	console.log(JSON.stringify(scope, null, 2)); // TODO
}

//process_songlist_file("main.songlist");
//process_au_file("main.au");
process_4st_file("main.4st");
