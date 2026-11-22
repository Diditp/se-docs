import type { APIRoute, GetStaticPaths } from 'astro';
import { AGENT_FILES } from '../../data/agent-files';

export const getStaticPaths = (() =>
  Object.keys(AGENT_FILES).map((path) => ({ params: { path }, props: { content: AGENT_FILES[path] } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response(props.content as string, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
