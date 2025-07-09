<p align="center">
<p align="center">
<a  href="https://modelcontextprotocol.io/introduction"><img  src="./screenshots/mcp.png"  alt="Model Context Protocol"  width="150" height="150" hspace="50" /></a>
<a  href="https://www.heroku.com/"><img  src="./screenshots/heroku.webp"  alt="Heroku"  width="150" height="150" hspace="50"/></a>
<p/>
<p/>

# TODO Items

- [x] MCP Overview
- [ ] MCP Client
  - [ ] methods
  - [ ] security
- [ ] MCP Server
  - [ ] `stdio`
  - [ ] `sse`
  - [ ] Streamable HTTP
  - [ ] files
  - [ ] tools
  - [ ] prompts

# Exploring Model Context Protocol (MCP) with Heroku

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) seems to be everywhere these days. This projects showcases some of the inner workings of the MCP and architectural patterns when integrating with various Agents.P

# Table of Contents

- [TODO Items](#todo-items)
- [Exploring Model Context Protocol (MCP) with Heroku](#exploring-model-context-protocol-mcp-with-heroku)
- [Table of Contents](#table-of-contents)
  - [What does it do?](#what-does-it-do)
  - [Model Context Protocol Overview](#model-context-protocol-overview)
    - [What Problem Does MCP Solve?](#what-problem-does-mcp-solve)
    - [General MCP Architecture](#general-mcp-architecture)
- [License](#license)
- [Disclaimer](#disclaimer)

---

## What does it do?

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) seems to be everywhere these days. This projects showcases some of the inner workings of the MCP and architectural patterns when integrating with various Agents.

## Model Context Protocol Overview

The Model Context Protocol (MCP) is an [open standard](https://github.com/modelcontextprotocol) designed to define how applications communicate and provide context to LLMs. MCP provides a structured way to exchange context, instructions, and results, enabling interoperability across different platforms and model providers.

### What Problem Does MCP Solve?

MCP transforms how you can build AI Agents in a standardized way across various systems. Each AI service has its own way of:

- Sharing context and data
- Invoking tools and functions
- Passing messages back and forth

The role of MCP is to standardize how this is done so that the development work for one AI service can be easily reused by a different AI service. Otherwise, the same functionality would have to be custom coded for each AI service separately.

### General MCP Architecture

![](./screenshots/general-mcp-architecture.png)

# License

[MIT](http://www.opensource.org/licenses/mit-license.html)

# Disclaimer

This software is to be considered "sample code", a Type B Deliverable, and is delivered "as-is" to the user. Salesforce bears no responsibility to support the use or implementation of this software.
