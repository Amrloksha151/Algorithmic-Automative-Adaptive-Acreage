from workers import WorkerEntrypoint, Response
import asgi

from .main import app, run_autonomy_cycle


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        return await asgi.fetch(app, request, self.env)

    async def scheduled(self, controller, env, ctx):
        ctx.waitUntil(run_autonomy_cycle())
        return Response('scheduled ok')
