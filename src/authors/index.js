'use strict'

const { Ok } = require('crocks/Result')
const maybeToResult = require('crocks/Result/maybeToResult')
const find = require('crocks/Maybe/find')
const prop = require('crocks/Maybe/prop')
const safe = require('crocks/Maybe/safe')
const { flip } = require('crocks/combinators')
const { assign, compose, curry, pipe, pipeK } = require('crocks/helpers')
const { map, sequence } = require('crocks/pointfree')
const { not } = require('crocks/logic')

const R = require('ramda')

const {
  appendToList,
  createResponder,
  findIdxById,
  matchId,
  matchProp,
  removeItemById,
  updateItemAtIndex,
  updateSiteData
} = require('../utils')

// findAuthorById :: String -> [Author] -> Result ErrorCode Author
const findAuthorById = curry(authorId =>
  maybeToResult(404, find(matchId(authorId)))
)

// { author } -> Result ErrorCode Author
const readAuthor = maybeToResult(400, prop('author'))

// String -> [Author] -> Boolean
const isExistingAuthorId = curry(
  compose(
    R.any,
    matchId
  )
)

// setAuthors :: [Author] -> Object -> Object
const setAuthors = authors => assign({ authors })

// validateAuthor :: Author -> Result ErrorCode Author
const validateAuthor = maybeToResult(
  400,
  safe(author => typeof author.displayName === 'string')
)

// validateNewAuthor :: [Author] -> Author -> Result ErrorCode Author
const validateNewAuthor = authors =>
  maybeToResult(400, safe(author => !isExistingAuthorId(author.id, authors)))

// validateExistingAuthor :: [Author] -> Author -> Result ErrorCode Author
const validateExistingAuthor = authors =>
  maybeToResult(404, safe(author => isExistingAuthorId(author.id, authors)))

// readAuthorIdIfExists :: [Author] -> AuthorId -> Result ErrorCode AuthorId
const readAuthorIdIfExists = curry(authors =>
  maybeToResult(404, safe(flip(isExistingAuthorId)(authors)))
)

// readNewAuthor :: [Author] -> { author } -> Author
const readNewAuthor = curry(authors =>
  pipeK(
    readAuthor,
    validateAuthor,
    validateNewAuthor(authors)
  )
)

// readExistingAuthor :: [Author] -> { author } -> Author
const readExistingAuthor = curry(authors =>
  pipeK(
    readAuthor,
    validateAuthor,
    validateExistingAuthor(authors)
  )
)

// isOtherAuthor :: String -> { author } -> Boolean
const isAnotherAuthor = compose(
  not,
  matchProp('author')
)

/*
 * Here be Handlers
 */

const addAuthor = (req, res) => {
  const respond = createResponder(res, 200)
  const author = readNewAuthor(req.shared.data.authors, req.body)

  const updatedAuthors = author.map(appendToList(req.shared.data.authors))
  const updateDataFn = updatedAuthors.map(setAuthors)

  respond(
    updateDataFn
      .map(updateSiteData(req.shared))
      .chain(() => author.map(({ id }) => ({ authorId: id })))
  )
}

const deleteAuthor = (req, res) => {
  const respond = createResponder(res, 200)
  const authorId = readAuthorIdIfExists(
    req.shared.data.authors,
    req.params.authorId
  )
  const updatedAuthorsList = authorId.map(
    removeItemById(req.shared.data.authors)
  )
  const removePostsByAuthor = authorId.map(author =>
    pipe(
      R.filter(isAnotherAuthor(author)),
      map(post =>
        Object.assign({}, post, {
          comments: R.filter(isAnotherAuthor(author), post.comments)
        })
      )
    )
  )

  const updateAuthorsFn = updatedAuthorsList.map(setAuthors)

  const updatePostsFn = removePostsByAuthor
    .ap(Ok(req.shared.data.posts))
    .map(posts => assign({ posts }))

  respond(
    sequence(Ok, [updateAuthorsFn, updatePostsFn]).map(funcs =>
      updateSiteData(req.shared, compose(...funcs))
    )
  )
}

const getAuthor = (req, res) => {
  const respond = createResponder(res, 200)
  const { authorId } = req.params
  const author = findAuthorById(authorId, req.shared.data.authors)

  respond(author)
}

const getAuthors = (req, res) => {
  res.status(200).send(req.shared.data.authors)
}

const getCommentsForAuthor = (req, res) => {
  const { authorId } = req.params

  const commentsByAuthor = R.flatten(
    req.shared.data.posts.map(post => post.comments)
  ).filter(matchProp('author', authorId))

  res.status(200).send(commentsByAuthor)
}

const getPostsForAuthor = (req, res) => {
  const { authorId } = req.params

  const postsByAuthor = req.shared.data.posts.filter(
    matchProp('author', authorId)
  )

  res.status(200).send(postsByAuthor)
}

const updateAuthor = (req, res) => {
  const respond = createResponder(res, 200)
  const author = readExistingAuthor(req.shared.data.authors, req.body)
  const authorIdx = author.chain(({ id }) =>
    findIdxById(id, req.shared.data.authors)
  )
  const updatedAuthors = updateItemAtIndex(
    authorIdx,
    author,
    Ok(req.shared.data.authors)
  )
  const updateDataFn = updatedAuthors.map(setAuthors)

  respond(updateDataFn.map(updateSiteData(req.shared)))
}

module.exports = {
  addAuthor,
  deleteAuthor,
  getAuthor,
  getAuthors,
  getCommentsForAuthor,
  getPostsForAuthor,
  updateAuthor
}
