import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import fs from 'node:fs';
import path from 'node:path';
import { ActivityController } from './activity.controller';
import { ACTIVITY_MAPPER_KEY } from './log-activity.decorator';
import { AppController } from 'src/app.controller';
import { AuthController } from 'src/auth/auth.controller';
import { ClientsController } from 'src/clients/clients.controller';
import { DashboardController } from 'src/dashboard/dashboard.controller';
import { DealsController } from 'src/deals/deals.controller';
import { NotesController } from 'src/notes/notes.controller';
import { TasksController } from 'src/tasks/tasks.controller';
import { UsersController } from 'src/users/users.controller';

// A guard against forgetting the audit: every route that changes data must be logged, so a new
// POST/PATCH/PUT/DELETE without @LogActivity fails here.
const CONTROLLERS = [
  ActivityController,
  AppController,
  AuthController,
  ClientsController,
  DashboardController,
  DealsController,
  NotesController,
  TasksController,
  UsersController,
];

// Excluded on purpose: login, register, logout and refresh are not logged (no signed-in user on
// login, and credentials must never be near the log).
const NOT_LOGGED = [AuthController];

const MUTATING = [RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE];

const routesOf = (controller: new (...args: never[]) => unknown) =>
  Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => {
      const handler = (controller.prototype as Record<string, object>)[name];
      return {
        name,
        handler,
        method: Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined,
      };
    })
    .filter((route) => route.method !== undefined);

describe('logged routes', () => {
  it('knows every controller in the project', () => {
    const walk = (dir: string): string[] =>
      fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) =>
          entry.isDirectory()
            ? walk(path.join(dir, entry.name))
            : entry.name.endsWith('.controller.ts')
              ? [entry.name]
              : [],
        );

    expect(walk(path.join(__dirname, '..'))).toHaveLength(CONTROLLERS.length);
  });

  it('finds the mutating routes it is supposed to check', () => {
    const mutating = CONTROLLERS.flatMap((controller) =>
      routesOf(controller).filter((route) => MUTATING.includes(route.method as RequestMethod)),
    );

    expect(mutating.length).toBeGreaterThan(0);
  });

  describe.each(CONTROLLERS.filter((controller) => !NOT_LOGGED.includes(controller as never)))(
    '$name',
    (controller) => {
      it('logs every route that changes data and no route that only reads', () => {
        for (const route of routesOf(controller)) {
          const logged = Reflect.getMetadata(ACTIVITY_MAPPER_KEY, route.handler) !== undefined;
          const mutates = MUTATING.includes(route.method as RequestMethod);

          expect({ route: route.name, logged }).toEqual({ route: route.name, logged: mutates });
        }
      });
    },
  );

  it('does not log anything in the auth controller', () => {
    for (const route of routesOf(AuthController)) {
      expect(Reflect.getMetadata(ACTIVITY_MAPPER_KEY, route.handler)).toBeUndefined();
    }
  });
});
