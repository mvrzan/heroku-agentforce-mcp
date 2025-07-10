<p align="center">
<p align="center">
<a  href="https://modelcontextprotocol.io/introduction"><img  src="./screenshots/mcp.png"  alt="Model Context Protocol"  width="150" height="150" hspace="50" /></a>
<a  href="https://www.heroku.com/"><img  src="./screenshots/heroku.webp"  alt="Heroku"  width="150" height="150" hspace="50"/></a>
<p/>
<p/>

# Exploring Model Context Protocol (MCP) with Heroku

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) seems to be everywhere these days. This projects showcases some of the inner workings of the MCP and architectural patterns when integrating with various Agents.P

# Table of Contents

- [Exploring Model Context Protocol (MCP) with Heroku](#exploring-model-context-protocol-mcp-with-heroku)
- [Table of Contents](#table-of-contents)
  - [What does it do?](#what-does-it-do)
  - [Model Context Protocol Overview](#model-context-protocol-overview)
    - [What Problem Does MCP Solve?](#what-problem-does-mcp-solve)
    - [General MCP Architecture](#general-mcp-architecture)
  - [Project 1: Local MCP Client and Server](#project-1-local-mcp-client-and-server)
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

The diagram illustrates a general MCP architecture of how various applications on a user's machine interact with different AI backends through the Model Context Protocol.

On the **User Machine/Laptop**, different applications have a built-in **MCP Client**. That includes the following:

- **Claude Desktop**
- **CLI (Command-Line Interface)**
- **Cursor**

Each one of these applications has its own MCP client, but for the sake of the diagram, it is a single MCP client box. The MCP Client can communicate with various **MCP Servers**, each with a different hosting environment and purpose. The diagram showcases three examples, demonstrating the protocol's flexibility:

1.  **MCP Server A (local)**: A server running on the user's machine that can access **Local data**. It communicates with the MCP Client using the `stdio` transport. This server is accessing 3rd party service data, local data, and prompt information.
2.  **MCP Server B (AWS)**: A cloud-hosted server on AWS that connects to a **3rd party service B** via API calls. It uses `Server-Sent Events (SSE)` for communication, which is noted as a [deprecated method](https://modelcontextprotocol.io/docs/concepts/transports#server-sent-events-sse-deprecated).
3.  **MCP Server C (Heroku)**: Another cloud-hosted server on Heroku, which integrates with a **3rd party service A** and uses `Streamable HTTP` to communicate with the client.

This architecture allows any of the client applications (Cursor, CLI, etc.) to connect to any of the backend servers (local, AWS, or Heroku) through the MCP Client, without needing
to know the specific details of each server's implementation.

## Project 1: Local MCP Client and Server

![](./screenshots/general-mcp-architecture.png)

This project showcases how to have an MCP Client and Server running on your local machine.

The MCP

# License

[MIT](http://www.opensource.org/licenses/mit-license.html)

# Disclaimer

This software is to be considered "sample code", a Type B Deliverable, and is delivered "as-is" to the user. Salesforce bears no responsibility to support the use or implementation of this software.
