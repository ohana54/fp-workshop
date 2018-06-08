'use strict'

const http = require('http')
const listenOnFreePort = require('listen-on-free-port')
const stoppable = require('stoppable')
const express = require('express')
const cloneDeep = require('clone-deep')
const bodyParser = require('body-parser')

const { Just, Nothing } = require('crocks/maybe')

const {
  addPost,
  deletePost,
  getPost,
  getPosts,
  updatePost
} = require('./posts')

const {
  addAuthor,
  deleteAuthor,
  getAuthor,
  getAuthors,
  getPostsForAuthor,
  updateAuthor
} = require('./authors')

let server = Nothing()
module.exports = {
  start: siteData =>
    listenOnFreePort(3000, ['localhost'], () => {
      const app = express()

      const data = cloneDeep(siteData)
      const shared = { data }

      const jsonParser = bodyParser.json()
      app.use((req, res, next) => {
        req.shared = shared
        next()
      })

      app
        .route('/posts')
        .get(getPosts)
        .post(jsonParser, addPost)
      app
        .route('/posts/:postId')
        .get(getPost)
        .delete(deletePost)
        .put(jsonParser, updatePost)
      app
        .route('/authors/')
        .get(getAuthors)
        .post(jsonParser, addAuthor)
      app
        .route('/authors/:authorId')
        .get(getAuthor)
        .delete(deleteAuthor)
        .put(jsonParser, updateAuthor)
      app.route('/authors/:authorId/posts').get(getPostsForAuthor)

      return stoppable(http.createServer(app), 0)
    }).then(srv => {
      server = Just(srv)
      return `http://localhost:${srv.address().port}`
    }),
  stop: async () => {
    server.map(async s => {
      await new Promise(resolve => s.stop(resolve))
      server = Nothing()
    })
  }
}
