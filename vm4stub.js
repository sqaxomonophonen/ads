// npx uglify-js vm4stub.js --expression --compress --mangle eval,reserved=['s','u'] -o vm4stub.min.js

// convention: if a function argument begins with "__" it's not a real
// argument, but for defining local variables

// convention: put /*NOMANGL*/ in-front of variable declarations used in
// eval()s, meaning they should not be mangled. also add the name to the
// reserved=[] list above.

(words, entry) => {
	let
		current_opcode,
		current_oparg,

		pc = [entry, 0], // set program counter tuple to "main"

		stack = [],  // main/value stack
		/*NOMANGL*/s = n=>stack.splice(-n),      // pop n
		/*NOMANGL*/u = v=>0*stack.push(v),       // p[u]sh
		stack_pop = _=>s(1)[0],                  // pop 1

		stack_pick = n => stack[stack.length-n],
		stack_top  = _ => stack_pick(1),

		rstack = [], // return/loop stack

		advance = __tup => [current_opcode, current_oparg] = words[pc[0]][pc[1]++] || [0/*<-implicit return at end of instruction string*/], // get next instruction

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
		push_op = f=>ops.push(f),
		push_opn1_expr = (n,expr)=>push_op(eval("_=>{let[a,b]=s("+n+");u("+expr+")}")),
		call_word = goto_word_index => {
			rstack.push(pc);
			pc = [goto_word_index,0];
		}

		;

	/*ST4{STATIC*/
	push_op(__top=>{ // return
		for (;;) {
			__top = rstack.pop();
			if (typeof __top == "number") continue; // unroll past loop related rstack entries
			if (typeof __top == "undefined") return 1; // return to void (stop executing)
			pc = __top; // normal return
			break;
		}
	});
	// if/else/endif:
	push_op(_ => stack_pop() ? 0 : ifskip()); // if
	push_op(_ => ifskip());                   // else
	push_op(_ => 0);                          // endif : no-op; used as marker for ifskip()
	/*ST4}STATIC*/

	/*ST4:PUSH_IMM*/push_op(_ => u(current_oparg));

	/*ST4{TIMES_LOOP*/
	push_op(_ => { // times
		rstack.push(stack_pop());
		rstack.push(pc[1]);
	});
	push_op(_ => { // loop
		if (--rstack[rstack.length-2]) {
			pc[1] = rstack[rstack.length-1];
		} else {
			rstack.pop();
			rstack.pop();
		}
	});
	/*ST4}TIMES_LOOP*/

	/*ST4{DO_WHILE*/
	push_op(_ => { // do
		rstack.push(pc[1]);
	});
	push_op(_ => { // while
		if (stack_pop()) {
			pc[1] = rstack[rstack.length-1];
		} else {
			rstack.pop();
		}
	});
	/*ST4}DO_WHILE*/

	/*ST4:CALL_IMM*/push_op(_ => call_word(current_oparg)); // immediate call
	/*ST4:CALL_POP*/push_op(_ => call_word(stack_pop())); // indirect/popped call

	/*ST4:DUP*/push_op(_ => u(stack[stack.length-1])); // dup (a -- a a)
	/*ST4:DROP*/push_op(__a => { stack_pop() }); // drop (a --)
	const nrot = (n, d, __xs, __i) => {
		__xs = s(n);
		for (__i=0; __i<n; __i++) u(__xs[(__i+n+d)%n])
	};
	/*
	const nrot = (n, __i, __i0, __tmp, __i1) => {
		// (PERF) possibly faster inline version of nrot, but more
		// expensive in size
		__i0 = stack.length - n;
		__tmp = stack[__i0];
		for (__i=1; __i<n; __i++) stack[__i0 + __i - 1] = stack[__i0 + __i]
		stack[__i0 + n - 1] = __tmp;
	};
	*/
	/*ST4:SWAP*/push_op(_=>nrot(2,1));
	/*ST4:ROT*/push_op(_=>nrot(3,1));
	/*ST4:NROT*/push_op(_=>nrot(stack_pop(),1));
	/*ST4:TRO*/push_op(_=>nrot(3,-1));
	/*ST4:NTRO*/push_op(_=>nrot(stack_pop(),-1));

	for (op of ssplit(ST4_INFIX))  push_opn1_expr(2, "a"+op+"b");
	for (op of ST4_PREFIX)         push_opn1_expr(1, op+"a");
	for (op of ssplit(ST4_MATH1))  push_opn1_expr(1, "Math."+op+"(a)");

	/*ST4:arrnew*/     push_op(_ => u([]));
	/*ST4:arrlen*/     push_op(_ => u(stack_top().length));
	/*ST4:arrpush*/    push_op(_ => 0*stack_pick(2).push(stack_pop()));
	/*ST4:arrpop*/     push_op(_ => u(stack_top().pop()));
	/*ST4:arrunshift*/ push_op(_ => 0*stack_pick(2).unshift(stack_pop()));
	/*ST4:arrshift*/   push_op(_ => u(stack_top().shift()));
	/*ST4:arrget*/     push_op(_ => u(stack_pick(2)[stack_pop()]));
	/*ST4:arrset*/     push_op((__k,__v) => { [__k,__v] = s(2); stack_top()[__k] = __v; });
	/*ST4:arrjoin*/    push_op((__a,__b) => { [__a,__b] = s(2); u([...__a, ...__b]); });
	/*ST4:arrsplit*/   push_op((__pivot, __xs) => { __pivot = stack_pop(); __xs = stack_pop(); u(__xs.slice(0,__pivot)); u(__xs.slice(__pivot)); });

	/*ST4:thru*/       push_op(_=>0);
	/*ST4:curvegen*/   push_op(_=>0);
	/*ST4:compseq*/    push_op(_=>0);
	/*ST4:comppar*/    push_op(_=>0);
	/*ST4:swizz*/      push_op(_=>0);
	/*ST4:boxen*/      push_op(_=>0);

	/*ST4{DEBUG*/
	push_op(_ => { if (!stack_pop()) throw new Error("ASSERTION FAILED"); }) // assert
	push_op(_ => { console.log(JSON.stringify(["STACK", stack, "/R", rstack])); }); // dump
	/*ST4}DEBUG*/

	let n_ops_executed = 0;
	for (;advance(),!ops[current_opcode](); n_ops_executed++); // execution loop

	return [n_ops_executed, stack, rstack]; // XXX don't bother in "production"
}
