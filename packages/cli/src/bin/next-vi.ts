#!/usr/bin/env node

import { Command } from "commander";

const program = new Command();

program
  .name("next-vi")
  .description("Next.js Routing/Cache Visual Inspector CLI")
  .version("0.1.0");

program.parse();
