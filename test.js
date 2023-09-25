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
		vm_state.set_cycle_counter(1e3);
		vm_state.run();
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
	}
});

function resolve_breakpoints(src) {
	const BRK0 = "(BRK";
	const lines = src.split("\n");
	const n_lines = lines.length;
	let breakpoints = {};
	const new_lines = []; // hehe
	for (let line_number = 0; line_number < n_lines; line_number++) {
		let line = lines[line_number];
		for (;;) {
			const p0 = line.indexOf(BRK0);
			if (p0 === -1) break;
			let p = p0 + BRK0.length;
			const pn = p;
			while ("0" <= line[p] && line[p] <= "9") p++;
			if (line[p++] !== ")") throw new Error("bad breakpoint in line: " + line);
			const p1 = p;
			const brknum = parseInt(line.slice(pn, p1));
			if (breakpoints[brknum] !== undefined) throw new Error("BRK" + brknum + " occurs 2+ times");
			breakpoints[brknum] = [line_number, p0];
			line = line.slice(0, p0) + line.slice(p1);
		}
		new_lines.push(line);
	}
	return { src: new_lines.join("\n"), breakpoints };
}

TEST("resolve_breakpoints (test-test)", ()=>{
	const { breakpoints } = resolve_breakpoints(`
		:w0rd (BRK1)69 ;
		:w3rd (BRK2)42 ;
		(BRK0)790
	`);
	if (Object.keys(breakpoints).length !== 3) throw new TRR("expected to find 3 breakpoints: got " + JSON.stringify(breakpoints));
	const A = (p) => { if (!p) throw new TRR("assertion failed"); };

	// BRK0 should be last (after the two other breakpoints)
	A(breakpoints[0][0] > breakpoints[1][0]);
	A(breakpoints[0][0] > breakpoints[2][0]);

	// BRK1 should be first
	A(breakpoints[1][0] < breakpoints[0][0]);
	A(breakpoints[1][0] < breakpoints[2][0]);

	// BRK2 should be in between
	A(breakpoints[2][0] > breakpoints[1][0]);
	A(breakpoints[2][0] < breakpoints[0][0]);
});

function prep_test(tagged_src) {
	const { src, breakpoints } = resolve_breakpoints(tagged_src);
	const FILENAME = "<test.4st>";
	const cc = create_compiler(mk_filesys({[FILENAME]: src}));
	const cu = cc.compile(FILENAME);
	const prg = cu.trace_program_debug((word_path) => word_path === "main");
	if (prg.export_word_indices.length !== 1) throw new TRR("expected 1 exported word index, got: " + JSON.stringify(prg.export_word_indices));
	const vm_state = prg.new_state();
	vm_state.set_pc_to_export_word_index(0);
	vm_state.set_cycle_counter(1e4);

	let resolved_breakpoints = {};
	for (const k in breakpoints) {
		resolved_breakpoints[k] = prg.resolve_breakpoint(
			FILENAME,
			breakpoints[k][0],
			breakpoints[k][1]);
		if (!resolved_breakpoints[k]) throw new Error("breakpoint not resolved");

	}

	// monkey patching vm_state a bit..
	if (vm_state.run_until_brk) throw new Error("COLLISION");
	vm_state.run_until_brk = (num) => {
		const bp = resolved_breakpoints[num];
		if (bp === undefined) throw new Error("BRK" + num + " does not exist");
		const rr = vm_state.run(bp);
		if (rr !== "usrbrk") throw new TRR("expected to break at ''usrbrk'', got ''" + rr + "''");
	};
	if (vm_state.run_until_softbrk) throw new Error("COLLISION");
	vm_state.run_until_softbrk = () => {
		const rr = vm_state.run();
		if (rr !== "brk") throw new TRR("expected to break at ''brk'', got ''" + rr + "''");
	};
	if (vm_state.run_until_end) throw new Error("COLLISION");
	vm_state.run_until_end = () => {
		const rr = vm_state.run();
		if (rr !== "end") throw new TRR("expected program to stop at ''end'', got ''" + rr + "''");
		ASSERT_DONE(vm_state);
	};

	return vm_state;
}

TEST("cycle accounting", ()=>{
	// these are important for single-stepping (debugger), and so on, which
	// works by counting cycles
	function test(expected_cycles, n_tmpbrks, body, expected_stack) {
		const vm_state = prep_test(":main " + body + " ;");
		const i0 = vm_state.get_cycle_counter();
		for (let i = 0; i < n_tmpbrks; i++) vm_state.run_until_brk(i);
		vm_state.run_until_end();
		const actual_cycles = i0 - vm_state.get_cycle_counter();
		ASSERT_SAME("cycles", actual_cycles, expected_cycles);
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
	}

	test(1, 0, "", []); // 1 return
	test(2, 0, "69", [69]); // 1 return + 1 push
	test(3, 0, "69 42", [69,42]); // 1 return + 2 pushes
	test(4, 0, ":w0rd 790 ; w0rd", [790]); // 2 returns, 1 push, 1 call

	// tests containing breakpoints
	test(2, 1, "(BRK0)69", [69]);
	test(3, 2, "(BRK0)69 (BRK1)42", [69,42]);
	test(4, 1, ":w0rd (BRK0)790 ; w0rd",  [790]);
	test(4, 1, ":w0rd 790 ; (BRK0)w0rd",  [790]);
	//test(4, 1, ":w0rd (BRK0) 790 ; w0rd", [790]); // XXX FAIL
	//test(4, 1, ":w0rd 790 ; (BRK0) w0rd", [790]); // XXX FAIL

	// this one also tests the correct cycle count _at_ the breakpoint (the
	// above tests only consider the total)
	{
		const vm_state = prep_test(":main 1 2 (BRK0)3 4 5 ;");
		const i0 = vm_state.get_cycle_counter();

		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), [1,2]);
		const actual_cycles0 = i0 - vm_state.get_cycle_counter();
		ASSERT_SAME("cycles0", actual_cycles0, 2); // 1,2

		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), [1,2,3,4,5]);
		const actual_cycles1 = i0 - vm_state.get_cycle_counter();
		ASSERT_SAME("cycles1", actual_cycles1, 6); // 1,2,3,4,5,return
	}
});

TEST("breakpoints 101 (simple stuff)", ()=>{
	const vm_state = prep_test(`
		:main
		   111 222
		   (BRK0)333
		   444 555
		   (BRK1)666
		   777 888
		;
	`);

	// breakpoint at "333"
	vm_state.run_until_brk(0);
	ASSERT_SAME("stack", vm_state.get_stack(), [111,222]);

	// breakpoint at "666"
	vm_state.run_until_brk(1);
	ASSERT_SAME("stack", vm_state.get_stack(), [111,222,333,444,555]);

	// finish program
	vm_state.run_until_end();
	ASSERT_SAME("stack", vm_state.get_stack(), [111,222,333,444,555,666,777,888]);
});

TEST("breakpoints 102 (multiple on same line)", ()=>{
	const vm_state = prep_test(`
		:main
		(BRK0)0 (BRK1)1 (BRK2)2 (BRK3)3
		69
		;
	`);

	let expected_stack = [];
	for (let i = 0; i < 4; i++) {
		vm_state.run_until_brk(i);
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
		expected_stack.push(i);
	}
	vm_state.run_until_end();
	expected_stack.push(69);
	ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
});

TEST("breakpoints 103 (void brk)", ()=>{
	const vm_state = prep_test(`
		:main
		   0 (BRK0) 1 (BRK1)2 3
		   1 if 69 else 666 endif (BRK2) 420
		   0 if 69 else 666 endif (BRK3) 420
		;
	`);
	vm_state.run_until_brk(0);
	ASSERT_SAME("stack", vm_state.get_stack(), [0]);
	vm_state.run_until_brk(1);
	ASSERT_SAME("stack", vm_state.get_stack(), [0,1]);
	vm_state.run_until_brk(2);
	ASSERT_SAME("stack", vm_state.get_stack(), [0,1,2,3,69]);
	vm_state.run_until_brk(3);
	ASSERT_SAME("stack", vm_state.get_stack(), [0,1,2,3,69,420,666]);
	vm_state.run_until_end();
	ASSERT_SAME("stack", vm_state.get_stack(), [0,1,2,3,69,420,666,420]);
});

TEST("breakpoints 104 (start-of-word)", ()=>{
	{
		const vm_state = prep_test(`
			:main
			   (BRK0)1 2 3
			;
		`);
		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), []);
		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), [1,2,3]);
	}

	{
		const vm_state = prep_test(`
			:main
			   (BRK0)
			   1 2 3
			;
		`);
		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), []);
		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), [1,2,3]);
	}
});

TEST("breakpoints 105 (end-of-word)", ()=>{
	{
		const vm_state = prep_test(`
			:main
			   1 2 (BRK0)3
			;
		`);
		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), [1,2]);
		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), [1,2,3]);
	}

	{
		const vm_state = prep_test(`
			:w0rd
			   3
			;
			:main
			   1 2 (BRK0)w0rd
			;
		`);
		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), [1,2]);
		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), [1,2,3]);
	}

	{
		const vm_state = prep_test(`
			:main
			   1 2 3 (BRK0)
			;
		`);
		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), [1,2,3]);
		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), [1,2,3]);
	}
});

TEST("breakpoints 106 (word)", ()=>{
	{
		const vm_state = prep_test(`
			:main
			   :w0rd (BRK1)790 ; (BRK0)w0rd
			;
		`);
		// subtlety: BRK0 occurs after w0rd is done (in general, the
		// breakpoint occurs after the operation if the breakpoint
		// touches the token)
		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), []);
		vm_state.run_until_brk(1);
		ASSERT_SAME("stack", vm_state.get_stack(), []);
		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), [790]);
	}

	{
		const vm_state = prep_test(`
			:main
			   :w0rd 790 (BRK1) 69 ; (BRK0)w0rd
			;
		`);
		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), []);
		vm_state.run_until_brk(1);
		ASSERT_SAME("stack", vm_state.get_stack(), [790]);
		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), [790, 69]);
	}


	{
		const vm_state = prep_test(`
			:main
			   :w0rd 790 (BRK1)69 ; (BRK0)w0rd
			;
		`);
		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), []);
		vm_state.run_until_brk(1);
		ASSERT_SAME("stack", vm_state.get_stack(), [790]);
		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), [790, 69]);
	}

	{
		const vm_state = prep_test(`
			:main
			   :w0rd 790 69 (BRK1) ; (BRK0)w0rd
			;
		`);
		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), []);
		vm_state.run_until_brk(1);
		ASSERT_SAME("stack", vm_state.get_stack(), [790, 69]);
		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), [790, 69]);
	}

	{
		const vm_state = prep_test(`
			:main
			   :w0rd (BRK1) 790 ; (BRK0)w0rd
			;
		`);
		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), []);
		vm_state.run_until_brk(1);
		ASSERT_SAME("stack", vm_state.get_stack(), []);
		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), [790]);
	}

	{
		const vm_state = prep_test(`
			:main
			   :w0rd (BRK1)790 ; (BRK0) w0rd
			;
		`);
		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), []);
		vm_state.run_until_brk(1);
		ASSERT_SAME("stack", vm_state.get_stack(), []);
		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), [790]);
	}

	{
		const vm_state = prep_test(`
			:main
			   :w0rd (BRK1) 790 ; (BRK0) w0rd
			;
		`);
		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), []);
		vm_state.run_until_brk(1);
		ASSERT_SAME("stack", vm_state.get_stack(), []);
		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), [790]);
	}
});

TEST("breakpoints 203 (if/else/endif)", ()=>{
	function test(body, expected_stacks) {
		const vm_state = prep_test(":main " + body + " ;");
		while (expected_stacks.length > 0) {
			if (expected_stacks.length > 1) {
				vm_state.run_until_brk(0);
			} else {
				vm_state.run_until_end();
			}
			ASSERT_SAME("stack", vm_state.get_stack(), expected_stacks.shift());
		}
		ASSERT_DONE(vm_state);
	}
	// FUN FACT: most of these tests have failed at some point, and for a
	// bunch of different reasons
	test("1 if 420 else 666 endif",      [[420]]);
	test("1 if (BRK0)420 else 666 endif", [[], [420]]);
	test("1 if 420 (BRK0) else 666 endif", [[420],[420]]);
	test("1 if 420 (BRK0)else 666 endif", [[420]]); // XXX ... should it break after else? i.e. [[420],[420]]
	test("1 if 420 (BRK0)else 666 endif 790", [[420,790]]); // XXX ... should it break after else? i.e. [[420],[420]]
	test("0 if 420 (BRK0)else 666 endif", [[666]]);
	test("0 if 420 else (BRK0)666 endif", [[], [666]]);
	test("0 if 420 else 666 (BRK0)endif", [[666], [666]]);
	test("1 if 420 else 666 (BRK0)endif", [[420]]);
	test("0 if 420 else 666 (BRK0)endif 69", [[666], [666,69]]);
	test("1 if 420 else 666 (BRK0)endif 69", [[420,69]]);
	test("0 if 420 else 666 endif (BRK0) 69", [[666], [666,69]]);
	test("1 if 420 else 666 endif (BRK0) 69", [[420], [420,69]]);
	test("0 if 420 else 666 endif   (BRK0)   69 790", [[666], [666,69,790]]);
	test("1 if 420 else 666 endif   (BRK0)   69 790", [[420], [420,69,790]]);
	test("0 if 420 else 666 endif (BRK0)69", [[666], [666,69]]);
	test("1 if 420 else 666 endif (BRK0)69", [[420], [420,69]]);
	test("(BRK0)1 if 420 else 666 endif", [[], [420]]);
	test("(BRK0)0 if 420 else 666 endif", [[], [666]]);
	test("69 (BRK0)1 if 420 else 666 endif", [[69], [69, 420]]);
	test("69 (BRK0)0 if 420 else 666 endif", [[69], [69, 666]]);
	test("1 (BRK0)if 420 else 666 endif", [[1], [420]]);
	test("0 (BRK0)if 420 else 666 endif", [[0], [666]]);
	test("0 if 0 if 666 endif else 69 endif ", [[69]]);
	test("0 if 0 (BRK0)if 666 endif else 69 endif ", [[69]]);
	test("0 if 0 if 666 (BRK0)endif else 69 endif ", [[69]]);
	test("0 if 0 if 666 endif (BRK0)else 69 endif ", [[69]]);
	test("0 if 0 if 666 endif else 69 (BRK0)endif ", [[69],[69]]);
});

TEST("breakpoints 204 (times/loop)", ()=>{
	{ // test "times"-breakpoint; it should only be "visited" once
		const vm_state = prep_test(`
			:main
			   5 (BRK0)times
			      69
			   loop
			;
		`);

		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), [5]);
		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), [69,69,69,69,69]);
	}

	{
		const vm_state = prep_test(`
			:main
			   5 times
			      (BRK0) 69
			   loop
			;
		`);

		let expected_stack = [];
		for (let i = 0; i < 5; i++) {
			vm_state.run_until_brk(0);
			ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
			expected_stack.push(69);
		}
		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
	}

	{
		const vm_state = prep_test(`
			:main
			   5 times
			      69 (BRK0)
			   loop
			;
		`);

		let expected_stack = [];
		for (let i = 0; i < 5; i++) {
			vm_state.run_until_brk(0);
			expected_stack.push(69);
			ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
		}
		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), expected_stack);
	}
});

TEST("breakpoints 205 (do/while)", ()=>{
	{
		const vm_state = prep_test(`
			:main
			   : dup 0 pick ;
			   1
			   (BRK0)do
			   2 *
			   dup 5 lt while
			;
		`);
		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), [1]);
		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), [8]);
	}

	{
		const vm_state = prep_test(`
			:main
			   : dup 0 pick ;
			   1
			   do
			   2 *
			   dup 5 lt (BRK0)while
			;
		`);
		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), [2,true]);
		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), [4,true]);
		vm_state.run_until_brk(0);
		ASSERT_SAME("stack", vm_state.get_stack(), [8,false]);
		vm_state.run_until_end();
		ASSERT_SAME("stack", vm_state.get_stack(), [8]);
	}
});

NOTEST("debuggering 301 (single-step)", ()=>{
	const vm_state = prep_test(`
	:main
	1 2 (BRK)3 4 5
	;
	`);
	RUN_UNTIL_TMPBRK(vm_state);
	ASSERT_SAME("stack", vm_state.get_stack(), [1,2,3]);
	vm_state.single_step(1);
	ASSERT_SAME("stack", vm_state.get_stack(), [1,2,3,4]);
	vm_state.single_step(1);
	ASSERT_SAME("stack", vm_state.get_stack(), [1,2,3,4,5]);
	vm_state.single_step(-1);
	ASSERT_SAME("stack", vm_state.get_stack(), [1,2,3,4]);
	vm_state.single_step(-1);
	ASSERT_SAME("stack", vm_state.get_stack(), [1,2,3]);
	vm_state.single_step(-1);
	ASSERT_SAME("stack", vm_state.get_stack(), [1,2]);
	vm_state.single_step(-1);
	ASSERT_SAME("stack", vm_state.get_stack(), [1]);
	vm_state.single_step(-1);
	ASSERT_SAME("stack", vm_state.get_stack(), []);
});

{
	const compiler = require("./compiler")(read_file);
	for (let file of ["selftest.4st"]) {
		const o = compiler.compile(file);
		const test_prg = o.trace_program_debug((word_path) => compiler.is_test_word(word_path.split(":").pop()));
		for (let xi = 0; xi < test_prg.export_word_indices.length; xi++) {
			const word_name = test_prg.export_word_names[xi];
			TEST(file+":"+word_name, () => {
				//const t0 = Date.now();
				const MAX_INSTRUCTIONS = 1e8;
				let vm_state = test_prg.new_state();
				vm_state.set_dump_callback((vm_state) => {
					const stack = vm_state.get_tagged_stack();
					const rstack = vm_state.get_rstack();
					console.log("STACK", stack, "/R", rstack);

				});
				vm_state.set_cycle_counter(MAX_INSTRUCTIONS);
				vm_state.set_pc_to_export_word_index(xi);

				while (vm_state.can_run()) {
					const rr = vm_state.run();
					if (!vm_state.did_exit()) {
						const pos = vm_state.get_position_human();
						if (rr === "assert") {
							throw new TRR("ASSERTION FAILED at " + pos);
						} else if (rr === "brk") {
							// OK: some tests break
						} else {
							throw new TRR("unhandled exit at " + pos + " / " + JSON.stringify(rr));
						}
					}
				}
				if (!vm_state.did_exit()) {
					throw new TRR("not a clean exit at " + vm_state.get_position_human());
				}

				const n_ops = MAX_INSTRUCTIONS - vm_state.get_cycle_counter();
				const stack = vm_state.get_stack();
				const rstack = vm_state.get_rstack();
				if (stack.length !== 0 || rstack.length !== 0)  throw new TRR("unclean stack after test: " + JSON.stringify([stack,"/R",rstack]));
				// XXX leaving out timing information because it's unreliable. for instance,
				// ":test_performance" seems to leave node/V8 in a funky state that causes the
				// timing of the following test to be much higher than otherwise, e.g. 30ms
				// instead of 1ms ... ":test_performance" is also the kind of test that
				// "encourages" the VM to roll out the big JIT-machinery, so...
				//const dt = Date.now()-t0;
				//return n_ops + "op/" + dt + "ms";
				return n_ops + "op";
			});
		}
	}
}
