// Every line the forum server can answer an error with (Global Village). Owner: Forum.
//
// An error is an HTTP status and { "error": "<one of these lines, exactly>" }. The game shows the
// line through t(), so every line here is in the language files: add a line here, add it there.
// The lines never carry details (no names, no numbers, no stack traces).

export const ERRORS = {
  badRequest: "That request wasn't understood.",
  notFound: 'Not found.',
  postGone: 'That town is gone.',
  commentGone: 'That comment is gone.',
  whoAreYou: "This browser's Global Village identity wasn't recognised.",
  notYours: "That isn't yours.",
  blocked: "You can't post, comment or like in Global Village.",
  slowDown: 'Slow down a little. Try again in a few minutes.',
  tooBig: 'That is too big to send.',
  townTooBig: 'This town is too big to post.',
  townUnreadable: "This town can't be opened by Little City.",
  townEmpty: 'Build something first.',
  badPicture: 'The picture must be a JPEG of at most 640 × 400 and 300 KB.',
  captionTooLong: 'A caption is at most 140 characters.',
  nameNeeded: 'Pick a name first.',
  badName: 'A name is 1 to 20 characters.',
  badComment: 'A comment is 1 to 280 characters.',
  broken: 'Something went wrong on the server. Try again later.',
} as const;

export type ErrorKey = keyof typeof ERRORS;

/** Every fixed line, for the language files. */
export const ERROR_LINES: readonly string[] = Object.values(ERRORS);

/** A refusal: the status and which line. Thrown inside a handler, answered by the server. */
export class Refusal extends Error {
  constructor(
    readonly status: number,
    readonly key: ErrorKey,
  ) {
    super(ERRORS[key]);
  }
}

export const refuse = (status: number, key: ErrorKey): never => {
  throw new Refusal(status, key);
};
