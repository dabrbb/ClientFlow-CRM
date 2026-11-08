// A date, or an instant with an explicit offset. A date-time without Z/offset is rejected
// because Date would read it in the server's local time zone.
export const DATE_OR_INSTANT =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;
