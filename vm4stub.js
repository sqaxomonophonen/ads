// npx uglify-js vm4stub.js --expression --compress --mangle eval,reserved=['s','u'] -o vm4stub.min.js

// "state" should be initialized like this:
// [
//    <entry point word index>, // PC0: current word index executing
//    0,                        // PC1: current op index executing
//    [],                       // stack  (main stack)
//    [],                       // rstack (return/loop stack)
//    [],                       // globals (accessed with getglobal/setglobal)
//    1e7,                      // max op count; MUST be >0
//    new WeakSet(),            // graph tag set (arrays tagged with _DTGRAPH)
// ]
// the function returns state in same format (so the VM can be re-entered after
// execution breaks). the "max op count" (index 5) is decremented for each op
// executed, and the VM will exit when it reaches zero, so remember to reset it
// to a positive value if you intend to continue execution (e.g. to prevent
// infinite loops or memory bomb kind of things)

// convention: if a function argument begins with "__" it's not a real
// argument, but for defining local variables

// convention: put /*NOMANGL*/ in-front of variable declarations used in
// eval()s, meaning they should not be mangled. also add the name to the
// reserved=[] list above.

// convention: tag code that should be different/removed when doing size
// optimized release builds with "XXX(size)" and maybe a comment about it.

// comments in the format of "/*ST4...*/" are directives for compiler.js

(words, state) => {
	let
		[
			// see state explanation above
			pc0, pc1,
			stack,
			rstack,
			globals,
			max_instructions, // XXX(size) this is only required for "live coding safety" and step debugging
			graph_tag_set,    // XXX(size) a debug thing
		] = state,

		current_opcode,
		current_oparg,

		/*NOMANGL*/s = n=>stack.splice(-n),  // pop n
		/*NOMANGL*/u = v=>0*stack.push(v),   // p[u]sh
		POP = _=>s(1)[0],                    // pop 1
		PICK = n => stack[stack.length-n-1],
		TOP  = _ => PICK(0),

		advance = __tup => [current_opcode, current_oparg] = words[pc0][pc1++] || [0], // get next instruction
		// NOTE: "|| [0]" injects implicit return ops past end of
		// instruction list (because ISA[0] is an explicit return op)

		ifskip = (__depth) => {
			__depth = 0;
			for (;;) {
				advance();
				// stop at "else" or "endif" when not nested:
				if (!__depth && (current_opcode == 2 || current_opcode == 3)) break;
				// skip over nested if...endif:
				__depth += (current_opcode == 1) - (current_opcode == 3); // "if" increments depth, "endif" decrements
				//__depth += [,1,,-1][current_opcode]|0; // not shorter after uglify
			}
		},

		ops = [],
		ssplit = s=>s.split(" "),
		push_op = function() { ops = [...ops, ...arguments]; }

		push_opn1_expr = (n,expr)=>push_op(eval("_=>{let[a,b]=s("+n+");u("+expr+")}")),
		call_word = goto_word_index => {
			rstack.push([pc0,pc1]);
			pc0 = goto_word_index;
			pc1 = 0;
		}

		;

	/*ST4{STATIC*/
	push_op(
		__top=>{ // return
			for (;;) {
				__top = rstack.pop();
				if (typeof __top == "number") continue; // unroll past loop related rstack entries
				if (typeof __top == "undefined") {
					pc0 = -1; // XXX(size) this is only required for step debugging (if pc0>=0 it's a "brk")
					return 1; // return to void (stop executing)
				} else {
					[pc0, pc1] = __top; // normal return
					break;
				}
			}
		},
		// if/else/endif:
		_ => POP() ? 0 : ifskip(),  // if
		_ => ifskip(),              // else
		_ => 0);                    // endif : no-op; used as marker for ifskip()
	/*ST4}STATIC*/

	/*ST4:PUSH_IMM*/push_op(_ => u(current_oparg));

	/*ST4{TIMES_LOOP*/
	push_op(
		_ => { // times
			rstack.push(POP());
			rstack.push(pc1);
		},
		_ => { // loop
			if (--rstack[rstack.length-2]) {
				pc1 = rstack[rstack.length-1];
			} else {
				rstack.pop();
				rstack.pop();
			}
		}
	);
	/*ST4}TIMES_LOOP*/

	/*ST4{DO_WHILE*/
	push_op(
		_ => { // do
			rstack.push(pc1);
		},
		_ => { // while
			if (POP()) {
				pc1 = rstack[rstack.length-1];
			} else {
				rstack.pop();
			}
		}
	);
	/*ST4}DO_WHILE*/

	/*ST4:CALL_IMM*/push_op(_ => call_word(current_oparg)); // immediate call
	/*ST4:CALL_POP*/push_op(_ => call_word(POP())); // indirect/popped call

	/*ST4:PICK*/push_op(_=> u(PICK(POP())));
	/*ST4:DROP*/push_op(__a => { POP() }); // drop (   a --       )
	const rotate = (direction, __n, __xs, __i) => {
		__n = POP();
		__xs = s(__n);
		for (__i=0; __i<__n; __i++) u(__xs[(__i+__n+direction)%__n])
	};
	/*
	const rotate = (n, __i, __i0, __tmp, __i1) => {
		// (PERF) possibly faster inline version of rotate, but more
		// expensive in size
		__i0 = stack.length - n;
		__tmp = stack[__i0];
		for (__i=1; __i<n; __i++) stack[__i0 + __i - 1] = stack[__i0 + __i]
		stack[__i0 + n - 1] = __tmp;
	};
	*/
	/*ST4:NROT*/push_op(_=>rotate(1));
	/*ST4:NTRO*/push_op(_=>rotate(-1));

	for (op of ssplit(ST4_INFIX))  push_opn1_expr(2, "a"+op+"b");
	for (op of ST4_PREFIX)         push_opn1_expr(1, op+"a");
	for (op of ssplit(ST4_MATH1))  push_opn1_expr(1, "Math."+op+"(a)");

	/*ST4:getglobal*/push_op(_=>u(globals[POP()]));
	/*ST4:setglobal*/push_op((__value,__index) => { [__index,__value] = s(2); globals[__index] = __value; });

	/*ST4:isnumber*/push_op(_=>u(!TOP().pop));
	/*ST4:isarr*/push_op(_=>u(!!TOP().pop));

	// probably more than a little inspired by stb_ds.h naming
	/*ST4:arrnew*/     push_op(_ => u([]));
	/*ST4:arrlen*/     push_op(_ => u(TOP().length));
	/*ST4:arrpush*/    push_op(_ => 0*PICK(1).push(POP()));
	/*ST4:arrpop*/     push_op(_ => u(TOP().pop()));
	/*ST4:arrunshift*/ push_op(_ => 0*PICK(1).unshift(POP()));
	/*ST4:arrshift*/   push_op(_ => u(TOP().shift()));
	/*ST4:arrget*/     push_op(_ => u(PICK(1)[POP()]));
	/*ST4:arrset*/     push_op((__k,__v) => { [__k,__v] = s(2); TOP()[__k] = __v; });
	/*ST4:arrjoin*/    push_op((__a,__b) => { [__a,__b] = s(2); u([...__a, ...__b]); });
	/*ST4:arrsplit*/   push_op((__pivot, __xs) => { __pivot = POP(); __xs = POP(); u(__xs.slice(0,__pivot)); u(__xs.slice(__pivot)); });

	/*ST4{DEBUG*/
	push_op(
		_ => { if (!POP()) throw new Error("ASSERTION FAILED"); }, // assert
		_ => { console.log("STACK", stack, JSON.stringify(stack), "/R", rstack); }, // dump
		_ => 1, // brk
		_ => (graph_tag_set.add(TOP()),0) // _DTGRAPH
	);
	/*ST4}DEBUG*/

	for (;advance(),(max_instructions--) && !ops[current_opcode]();) {}   // XXX(size) skip max_instructions stuff in release
	return [pc0,pc1,stack,rstack,globals,max_instructions,graph_tag_set]; // XXX(size) probably only return stack or stack[0] in release
}
