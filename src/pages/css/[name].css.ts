import { stylesheets } from '../../lib/assets'
import type { APIRoute } from 'astro'

export const getStaticPaths = () =>
  stylesheets.map(({ name, css }) => ({ params: { name }, props: { css } }))
export const GET: APIRoute = ({ props }) =>
  new Response(props.css, { headers: { 'Content-Type': 'text/css; charset=utf-8' } })
