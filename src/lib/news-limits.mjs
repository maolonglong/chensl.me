// One issue has at most this many items. The content schema and the vector cleanup both read
// it, so raising the limit also extends the IDs that a shrink or retraction deletes.
export const maxNewsItems = 30
