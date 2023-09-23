#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const create_compiler = require("./compiler");

const ESC   = "\u001b";
const NORM  =  ESC+"[0m";
const FAIL  =  txt => ESC+"[1;93;41m"+txt+NORM; // bold; fg=bright yellow; bg=red
const OK    =  txt => ESC+"[1;92m"+txt+NORM;    // bold; fg=bright green

class TRR extends Error {} // pronounced "TRR!!!"

function TEST(name, fn) {
	name += " "; while (name.length < 40) name += name.length&1?".":" ";
	try {
		let msg = fn();
		console.log(OK(name + " OK" + (msg ? " ("+msg+")" : "")));
	} catch (e) {
		if (e instanceof TRR) {
			console.log(FAIL(name + " FAILED (TRR)"));
			throw e;
		} else {
			console.log(FAIL(name + " FAILED (" + e + ")"));
			throw e;
		}
	}
}

function NOTEST(name, fn) {
	console.log("NOTEST " + name);
}

function ASSERT_SAME(what, actual, expected) {
	const actual_json = JSON.stringify(actual);
	const expected_json = JSON.stringify(expected);
	if (actual_json !== expected_json) {
		throw new TRR("ASSERTION FAILED for '" + what + "'; expected " + expected_json + " but got " + actual_json);
	}
}

function ASSERT_DONE(vm_state) {
	if (vm_state.can_run()) throw new TRR("expected program to end");
}

TEST("find word path", () => {

const SRC =
`:outer
  :inner
    420
  ;
  22 inner +
;`;

	function test_find_word_path(line, column, expected) {
		const cc = create_compiler(null);
		const filename = "<test.4st>";
		const state = cc.tokenize_string(filename, SRC);
		const actual = cc.find_word_path(state, filename, line, column);
		const pos_str = "line " + line + ", column " + column;
		if (actual !== expected) {
			throw new TRR("expected '" + expected + "' at " + pos_str + ", but got '" + actual + "'; " + JSON.stringify(state));
		}
	}

	// first line is ":outer"
	test_find_word_path(0, 0, "outer");
	test_find_word_path(0, 1, "outer");
	test_find_word_path(0, 4, "outer");
	test_find_word_path(0, 5, "outer");

	// until ":inner": on second line, we're still in ":outer"
	test_find_word_path(1, 0, "outer");
	test_find_word_path(1, 1, "outer");

	// at the third character ":inner" begins
	test_find_word_path(1, 2, "outer:inner");
	test_find_word_path(1, 3, "outer:inner");
	test_find_word_path(1, 6, "outer:inner");
	test_find_word_path(1, 7, "outer:inner");

	// third line: all ":inner"
	test_find_word_path(2, 0, "outer:inner");
	// fourth line: ":inner" ends...
	test_find_word_path(3, 0, "outer:inner");
	test_find_word_path(3, 1, "outer:inner");
	test_find_word_path(3, 2, "outer:inner");
	test_find_word_path(3, 3, "outer");

	test_find_word_path(4, 0, "outer");
	test_find_word_path(5, 0, "outer");

	// :outer ends past ";"
	test_find_word_path(5, 1, "");
});

function read_file(filename) {
	return fs.readFileSync(path.join(__dirname, filename), {"encoding": "utf8"});
}

let src_4_vm4stub_dot_js;
function mk_filesys(contents) {
	const VM4JS = "vm4stub.js";
	if (src_4_vm4stub_dot_js === undefined) {
		src_4_vm4stub_dot_js = read_file(VM4JS);
	}
	return (filename) => {
		if (contents[filename]) return contents[filename];
		if (filename === VM4JS) return src_4_vm4stub_dot_js;
		throw new TRR("attempted to read file that doesn't exist: " + filename);
	};
}

TEST("trace by word path", () => {
	const FILENAME = "<test.4st>";
	const cc = create_compiler(mk_filesys({[FILENAME]: `
	:outer
	  :inner
	    420
	  ;
	  24 inner +
	;
	`}));
	const cu = cc.compile(FILENAME);
	const TRIALS = [["outer:inner", 1, [420]], ["outer", 2, [444]]];
	for (const [word_path, expected_number_of_exports, expected_stack] of TRIALS) {
		const prg = cu.trace_program_debug((wp) => wp === word_path);
		if (prg.export_word_indices.length !== expected_number_of_exports) {
			throw new TRR("expected " + expected_number_of_exports + " exported word index/indices, got: " + JSON.stringify(prg.export_word_indices));
		}
		const vm_state = prg.new_state();
		vm_state.set_pc_to_export_word_index(0);
		vm_state.set_iteration_counter(1e3);
		vm_state.run();
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
	}
});

function resolve_breakpoints(src) {
	const BRK = "(BRK)";
	const lines = src.split("\n");
	const n_lines = lines.length;
	let breakpoints = [];
	const new_lines = []; // hehe
	for (let line_number = 0; line_number < n_lines; line_number++) {
		let line = lines[line_number];
		for (;;) {
			let column = line.indexOf(BRK);
			if (column === -1) break;
			breakpoints.push([line_number, column]);
			line = line.slice(0, column) + line.slice(column + BRK.length);
		}
		new_lines.push(line);
	}
	return { src: new_lines.join("\n"), breakpoints };
}


function prep_brk_test(tagged_src) {
	const { src, breakpoints } = resolve_breakpoints(tagged_src);
	const FILENAME = "<test.4st>";
	const cc = create_compiler(mk_filesys({[FILENAME]: src}));
	const cu = cc.compile(FILENAME);
	const prg = cu.trace_program_debug((word_path) => word_path === "main");
	if (prg.export_word_indices.length !== 1) throw new TRR("expected 1 exported word index, got: " + JSON.stringify(prg.export_word_indices));
	const vm_state = prg.new_state();
	vm_state.set_pc_to_export_word_index(0);
	vm_state.set_iteration_counter(1e4);
	for (const bp of breakpoints) {
		prg.set_breakpoint_at(cc.find_2lvl_position_at_or_after(prg.dbg_words, FILENAME, bp[0], bp[1]));
	}
	return vm_state;
}

TEST("breakpoints 101 (simple stuff)", () => {
	const vm_state = prep_brk_test(`
		:main
		   111 222
		   (BRK)333
		   444 555
		   (BRK)666
		   777 888
		;
	`);

	// breakpoint at "333"
	vm_state.run();
	// "333" has not yet been executed:
	ASSERT_SAME("stack", vm_state.get_stack(), [111,222]);
	// single-step...
	vm_state.step_over();
	ASSERT_SAME("stack", vm_state.get_stack(), [111,222,333]);

	// breakpoint at "666", samey samey...
	vm_state.run();
	ASSERT_SAME("stack", vm_state.get_stack(), [111,222,333,444,555]);
	vm_state.step_over();
	ASSERT_SAME("stack", vm_state.get_stack(), [111,222,333,444,555,666]);

	// finish program
	vm_state.run();
	ASSERT_SAME("stack", vm_state.get_stack(), [111,222,333,444,555,666,777,888]);
	ASSERT_DONE(vm_state);
});

TEST("breakpoints 102 (multiple on same line)", () => {
	const vm_state = prep_brk_test(`
		:main
		(BRK)0 (BRK)1 (BRK)2 (BRK)3
		;
	`);

	let expected_stack = [];
	for (let i = 0; i < 4; i++) {
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
		vm_state.run();
		vm_state.step_over();
		expected_stack.push(i);
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
	}
	vm_state.run();
	ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
	ASSERT_DONE(vm_state);
});

TEST("breakpoints 103 (precision)", () => {
	const vm_state = prep_brk_test(`
		:main
		0 (BRK) 1 (BRK)2 3
		;
	`);

	vm_state.run();
	vm_state.step_over();
	ASSERT_SAME("stack", vm_state.get_stack(), [0]);
	vm_state.run();
	vm_state.step_over();
	ASSERT_SAME("stack", vm_state.get_stack(), [0,1,2]);
	vm_state.run();
	ASSERT_SAME("stack", vm_state.get_stack(), [0,1,2,3]);
	ASSERT_DONE(vm_state);
});

TEST("breakpoints 201 (step over word)", () => {
	{
		const vm_state = prep_brk_test(`
			:main
			   :w0rd
			      420 666 brk drop drop 69
			   ;
			   5 times
			      11 1 (BRK)w0rd 2 22
			   loop
			;
		`);

		let expected_stack = [];
		for (let i = 0; i < 5; i++) {
			vm_state.run();
			expected_stack.push(11);
			expected_stack.push(1);
			ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
			vm_state.step_over();
			expected_stack.push(69);
			ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
			expected_stack.push(2);
			expected_stack.push(22);
		}
		vm_state.run();
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
		ASSERT_DONE(vm_state);
	}

	{
		const vm_state = prep_brk_test(`
			:main
			   :@w0rd
			      420 666 brk drop drop 69
			   ;
			   5 times
			      11 1 (BRK)\\w0rd (BRK)call 2 22
			   loop
			;
		`);

		let expected_stack = [];
		for (let i = 0; i < 5; i++) {
			vm_state.run();
			expected_stack.push(11);
			expected_stack.push(1);
			ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
			vm_state.step_over();
			vm_state.run();
			vm_state.step_over();
			expected_stack.push(69);
			ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
			expected_stack.push(2);
			expected_stack.push(22);
		}
		vm_state.run();
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
		ASSERT_DONE(vm_state);
	}
});

TEST("breakpoints 202 (at end-of-word)", () => {
	{
		const vm_state = prep_brk_test(`
			:main
			   1 2 (BRK)3
			;
		`);
		let expected_stack = [];
		vm_state.run();
		expected_stack.push(1);
		expected_stack.push(2);
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
		vm_state.step_over();
		expected_stack.push(3);
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
		vm_state.run();
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
		ASSERT_DONE(vm_state);
	}

	{
		// this one tests the ability to set breakpoints in "void";
		// breakpoints are used internally for stepping over a
		// word-call, and the position after the word-call is "void",
		// which is also interpreted as an implicit return by the VM.
		const vm_state = prep_brk_test(`
			:w0rd
			   3
			;
			:main
			   1 2 (BRK)w0rd
			;
		`);
		let expected_stack = [];
		vm_state.run();
		expected_stack.push(1);
		expected_stack.push(2);
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
		vm_state.step_over();
		expected_stack.push(3);
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
		vm_state.run();
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
		ASSERT_DONE(vm_state);
	}

});

TEST("breakpoints 203 (if/else/endif)", () => {
	function test(body, expected_stacks) {
		const vm_state = prep_brk_test(":main " + body + " ;");
		while (expected_stacks.length > 0) {
			vm_state.run();
			if (vm_state.can_run()) vm_state.step_over();
			ASSERT_SAME("stack", vm_state.get_stack(), expected_stacks.shift());
		}
		ASSERT_DONE(vm_state);
	}
	// FUN FACT: most of these tests have failed at some point, and for a
	// bunch of different reasons
	test("1 if 420 else 666 endif",      [[420]]);
	test("1 if (BRK)420 else 666 endif", [[420], [420]]);
	test("1 if 420 (BRK)else 666 endif", [[420], [420]]);
	test("0 if 420 (BRK)else 666 endif", [[666]]);
	test("0 if 420 else (BRK)666 endif", [[666], [666]]);
	test("0 if 420 else 666 (BRK)endif", [[666], [666]]);
	test("1 if 420 else 666 (BRK)endif", [[420]]);
	test("(BRK)1 if 420 else 666 endif", [[1], [420]]);
	test("(BRK)0 if 420 else 666 endif", [[0], [666]]);
	test("69 (BRK)1 if 420 else 666 endif", [[69, 1], [69, 420]]);
	test("69 (BRK)0 if 420 else 666 endif", [[69, 0], [69, 666]]);
	test("1 (BRK)if 420 else 666 endif", [[], [420]]);
	test("1 if 420 else 666 endif (BRK)5", [[420,5], [420,5]]);
	test("1 if 420 else 666 endif (BRK)", [[420]]);

	// XXX these tests fail to set a breakpoint in the "void" between
	// "endif" and "69"
	//test("1 if 420 else 666 endif   (BRK)   69", [[420], [420,69]]);
	// XXX this one gives the correct answer for the wrong reason :-) (BRK
	// falls back to "666")
	test("0 if 420 else 666 endif   (BRK)   69", [[666], [666,69]]);
});

TEST("breakpoints 204 (times/loop)", () => {
	{ // test "times"-breakpoint; it should only be "visited" once
		const vm_state = prep_brk_test(`
			:main
			   5 (BRK)times
			      69
			   loop
			;
		`);

		vm_state.run();
		ASSERT_SAME("stack", vm_state.get_stack(), [5]);
		vm_state.step_over();
		ASSERT_SAME("stack", vm_state.get_stack(), []);
		vm_state.run();
		ASSERT_SAME("stack", vm_state.get_stack(), [69,69,69,69,69]);
		ASSERT_DONE(vm_state);
	}

	{
		const vm_state = prep_brk_test(`
			:main
			   5 times
			      (BRK)69
			   loop
			;
		`);

		let expected_stack = [];
		for (let i = 0; i < 5; i++) {
			vm_state.run();
			ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
			vm_state.step_over();
			expected_stack.push(69);
			ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
		}
		vm_state.run();
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
		ASSERT_DONE(vm_state);
	}

	{
		const vm_state = prep_brk_test(`
			:main
			   5 times
			      69
			   (BRK)loop
			;
		`);

		let expected_stack = [];
		for (let i = 0; i < 5; i++) {
			vm_state.run();
			expected_stack.push(69);
			ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
			vm_state.step_over();
			ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
		}
		vm_state.run();
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
		ASSERT_DONE(vm_state);
	}

	{
		const vm_state = prep_brk_test(`
			:main
			   5 times
			      69
			   (BRK)loop
			;
		`);

		let expected_stack = [];
		for (let i = 0; i < 5; i++) {
			vm_state.run();
			expected_stack.push(69);
			ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
			vm_state.step_over();
			ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
		}
		vm_state.run();
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
		ASSERT_DONE(vm_state);
	}

});

TEST("breakpoints 205 (do/while)", () => {
	{
		const vm_state = prep_brk_test(`
			:main
			   : dup 0 pick ;
			   1
			   (BRK)do
			   2 *
			   dup 5 lt while
			;
		`);
		vm_state.run();
		ASSERT_SAME("stack", vm_state.get_stack(), [1]);
		vm_state.step_over();
		ASSERT_SAME("stack", vm_state.get_stack(), [1]);
		vm_state.run();
		ASSERT_SAME("stack", vm_state.get_stack(), [8]);
		ASSERT_DONE(vm_state);
	}

	{
		const vm_state = prep_brk_test(`
			:main
			   : dup 0 pick ;
			   1
			   do
			   2 *
			   dup 5 lt (BRK)while
			;
		`);
		vm_state.run();
		ASSERT_SAME("stack", vm_state.get_stack(), [2,true]);
		vm_state.step_over(); vm_state.run();
		ASSERT_SAME("stack", vm_state.get_stack(), [4,true]);
		vm_state.step_over(); vm_state.run();
		ASSERT_SAME("stack", vm_state.get_stack(), [8,false]);
		vm_state.step_over(); vm_state.run();
		ASSERT_SAME("stack", vm_state.get_stack(), [8]);
		ASSERT_DONE(vm_state);
	}
});


{
	const compiler = require("./compiler")(read_file);
	for (let file of ["selftest.4st"]) {
		const o = compiler.compile(file);
		const test_prg = o.trace_program_debug((word_path) => compiler.is_test_word(word_path.split(":").pop()));
		for (let xi = 0; xi < test_prg.export_word_indices.length; xi++) {
			const word_name = test_prg.export_word_names[xi];
			TEST(file+":"+word_name, () => {
				const MAX_INSTRUCTIONS = 1e8;
				let vm_state = test_prg.new_state();
				vm_state.set_dump_callback((vm_state) => {
					const stack = vm_state.get_tagged_stack();
					const rstack = vm_state.get_rstack();
					console.log("STACK", stack, "/R", rstack);

				});
				vm_state.set_iteration_counter(MAX_INSTRUCTIONS);
				vm_state.set_pc_to_export_word_index(xi);

				while (vm_state.can_run()) {
					vm_state.run();
					if (!vm_state.did_exit()) {
						const pos = vm_state.get_position_human();
						if (vm_state.broke_at_assertion()) {
							throw new TRR("ASSERTION FAILED at " + pos);
						} else if (vm_state.broke_at_breakpoint()) {
							// OK: some tests break
						} else {
							throw new TRR("unhandled exit at " + pos);
						}
					}
				}
				if (!vm_state.did_exit()) {
					throw new TRR("not a clean exit at " + vm_state.get_position_human());
				}

				const n_ops = MAX_INSTRUCTIONS - vm_state.get_iteration_counter();
				const stack = vm_state.get_stack();
				const rstack = vm_state.get_rstack();
				if (stack.length !== 0 || rstack.length !== 0)  throw new TRR("unclean stack after test: " + JSON.stringify([stack,"/R",rstack]));
				return n_ops + "op";
			});
		}
	}
}

