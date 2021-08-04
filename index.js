require('dotenv').config()
const Promise = require('bluebird')

async function start () {
  if (!process.env.DOCKER_HUB_USERNAME) throw new Error('The environment variable DOCKER_HUB_USERNAME is required')
  if (!process.env.DOCKER_HUB_PASSWORD) throw new Error('The environment variable DOCKER_HUB_PASSWORD is required')

  const {data: info} = await require('axios')({
    method: 'post',
    url: 'https://hub.docker.com/v2/users/login',
    data: {
      username: process.env.DOCKER_HUB_USERNAME,
      password: process.env.DOCKER_HUB_PASSWORD
    }
  })

  const axios = require('axios').create({
    baseURL: 'https://hub.docker.com/v2',
    headers: {
      'Authorization': `JWT ${info.token}`
    }
  })

  const repo = process.argv.slice(2)[0] || 'livingdocs/editor'
  const now = Date.now()
  const sinceTimestamp = 20 * 24 * 3600 * 1000
  const deleted = []
  const tags = await getTags(axios, {repo})
  const currentTags = await Promise.map(tags, async (tag) => {
    if (!/^v/.test(tag.name)) {
      const date = Date.parse(tag.last_updated)
      if ((now - date) < sinceTimestamp) return
      await deleteTag(axios, {repo, tag: tag.name})
      console.log('Deleted', tag.name)
      return tag
    }
  }, {concurrency: 5})
  deleted.push(...currentTags.filter(Boolean))

  console.log('Deleted %i Tags', deleted.length)
}

async function deleteTag (axios, {repo, tag}) {
  while (true) {
    try {
      await axios({
        method: 'delete',
        url: `/repositories/${repo}/tags/${tag}/`
      })
      break
    } catch (err) {
      if (err.response.status === 404) break
      if (![429, 503, 504].includes(err.response.status)) throw err
      console.warn(`Rate Limit to delete tag ${tag} exceeded`)
      await Promise.delay(5000)
    }
  }
}

async function getTags (axios, {amount, repo}) {
  const allTags = []
  let page = 1
  while (page) {
    try {
      const {data: {results: tags}} = await axios({
        method: 'get',
        url: `repositories/${repo}/tags?page_size=100&page=${page}`
      })

      allTags.push(...tags)
      if (tags.length !== 100) break
      page = page + 1
    } catch (err) {
      if (![429, 503, 504].includes(err.response.status)) throw err
      console.warn(`Rate Limit to list tags exceeded`)
      await Promise.delay(5000)
    }
    console.log('Fetched %s tags so far.', allTags.length)
  }

  console.log('Fetched %s tags.', allTags.length)
  return allTags
}

start()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
