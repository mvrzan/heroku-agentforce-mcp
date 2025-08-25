<p align="center">
<p align="center">
<a  href="https://www.salesforce.com/agentforce/"><img  src="./screenshots/agentforce_logo.webp"  alt="Agentforce"  width="150" height="150" hspace="50"/></a>
<a  href="https://modelcontextprotocol.io/introduction"><img  src="./screenshots/mcp.png"  alt="Model Context Protocol"  width="150" height="150" hspace="50" /></a>
<a  href="https://www.heroku.com/"><img  src="./screenshots/heroku.webp"  alt="Heroku"  width="150" height="150" hspace="50"/></a>
<p/>
<p/>

# Exploring Model Context Protocol (MCP) with Heroku and Agentforce

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) seems to be everywhere these days. This projects showcases some of the inner workings of the MCP and architectural patterns when integrating with various Agents including Agentforce. This repository has 3 projects:

1. A CLI tool with a local MCP Client and local MCP Server
2. A CLI tool with a local MCP Client and two remote MCP Servers hosted on Heroku
3. Agentforce and Heroku MCP server integration (pre-native Agentforce MCP client)

# Table of Contents

- [Exploring Model Context Protocol (MCP) with Heroku and Agentforce](#exploring-model-context-protocol-mcp-with-heroku-and-agentforce)
- [Table of Contents](#table-of-contents)
  - [Model Context Protocol Overview](#model-context-protocol-overview)
    - [What Problem Does MCP Solve?](#what-problem-does-mcp-solve)
    - [General MCP Architecture](#general-mcp-architecture)
  - [Project 1: Local MCP Client and Server](#project-1-local-mcp-client-and-server)
    - [Technologies used](#technologies-used)
    - [Configuration](#configuration)
      - [Requirements](#requirements)
      - [Setup](#setup)
          - [Local environment configuration](#local-environment-configuration)
        - [Development](#development)
  - [Project 2: Local MCP Client and Heroku MCP Server](#project-2-local-mcp-client-and-heroku-mcp-server)
    - [Technologies used](#technologies-used-1)
    - [Configuration](#configuration-1)
      - [Requirements](#requirements-1)
      - [Setup](#setup-1)
          - [Local environment configuration](#local-environment-configuration-1)
        - [Development](#development-1)
      - [Deployment](#deployment)
  - [Project 3: Agentforce and Heroku MCP Server integration (pre-native Agentforce MCP client)](#project-3-agentforce-and-heroku-mcp-server-integration-pre-native-agentforce-mcp-client)
    - [Technologies used](#technologies-used-2)
    - [Configuration](#configuration-2)
      - [Requirements](#requirements-2)
      - [Setup](#setup-2)
          - [Local environment configuration](#local-environment-configuration-2)
        - [Development](#development-2)
      - [Deployment](#deployment-1)
    - [Salesforce configuration](#salesforce-configuration)
  - [Project 4: Agentforce and Heroku MCP Server (native Agentforce MCP client)](#project-4-agentforce-and-heroku-mcp-server-native-agentforce-mcp-client)
- [License](#license)
- [Disclaimer](#disclaimer)

---

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

Each one of these applications has its own MCP client, but for the sake of the diagram, it is a single MCP client box. The MCP Clients can communicate with various **MCP Servers**, each with a different hosting environment and purpose. The diagram showcases three examples, demonstrating the protocol's flexibility:

1.  **MCP Server A (local)**: A server running on the user's machine that can access **Local data**. It communicates with the MCP Client using the `stdio` transport. This server is accessing 3rd party service data, local data, and prompt information.
2.  **MCP Server B (AWS)**: A cloud-hosted server on AWS that connects to a **3rd party service B** via API calls. It uses `Server-Sent Events (SSE)` for communication, which is noted as a [deprecated method](https://modelcontextprotocol.io/docs/concepts/transports#server-sent-events-sse-deprecated).
3.  **MCP Server C (Heroku)**: Another cloud-hosted server on Heroku, which integrates with a **3rd party service A** and uses `Streamable HTTP` to communicate with the client.

This architecture allows any of the client applications (Cursor, CLI, Claude Desktop, etc.) to connect to any of the backend servers (local, AWS, or Heroku) through the MCP Client, without needing
to know the specific details of each server's implementation.

## Project 1: Local MCP Client and Server

![](./screenshots/project-1-architecture-diagram.png)

This project showcases how to run an MCP Client and Server on your local machine, built with **Node.js**, **TypeScript**, and the **Anthropic SDK**. The architecture involves a single MCP client that communicates with a single MCP server over `stdio`:

The architecture diagram shows the following:

1.  **CLI Invocation**: The process starts when a user invokes a command through the **Command-Line Interface (CLI)**.
2.  **MCP Client (TypeScript)**: The CLI interacts with an **MCP Client** (implemented in TypeScript) to gather context from various resources.
3.  **MCP Server Capabilities**: The MCP Server is configured with the following capabilities:
    - **Local file**: Gathers local data ([data.json](./project_1/server/src/data/data.json))
    - **Invokes weather API tools**: Lists two weather API [tools](./project_1/server/src/index.ts#55)
    - **Prompt**: Sets a system [prompt](./project_1/server/src/index.ts#216)
4.  **Context Provisioning**: The MCP Client takes the payload from the MCP servers and passes it to the LLM as context.
5.  **LLM Processing**: The LLM (invoked via the [Anthropic SDK](./project_1/client/src/utils/MCPClient.ts#222)) processes the user's request using the context provided by the MCP Client and decides which resource to invoke.
6.  **CLI Output**: The LLM's response is returned to the CLI, which then displays the final output to the user.

This setup demonstrates a basic MCP interaction, showcasing how a single MCP Client can connect to a single MCP Server to enhance an LLM context.

### Technologies used

**Client**

- [Node.js](https://nodejs.org/en)
- [TypeScript](https://www.typescriptlang.org/)
- [Express](https://expressjs.com/)
- [Anthropic TypeScript API Library](https://github.com/anthropics/anthropic-sdk-typescript)
- [Model Context Protocol](https://github.com/modelcontextprotocol/typescript-sdk)

**Server**

- [Node.js](https://nodejs.org/en)
- [TypeScript](https://www.typescriptlang.org/)
- [Express](https://expressjs.com/)
- [Model Context Protocol](https://github.com/modelcontextprotocol/typescript-sdk)

### Configuration

#### Requirements

To run this application locally, you will need the following:

- An Anthropic [account](https://www.anthropic.com/) with a paid subscription to get an API key
- Node.js version 20 or later installed (type `node -v` in your terminal to check). Follow [instructions](https://nodejs.org/en/download) if you don't have node installed
- npm version 10.0.0 or later installed (type `npm -v` in your terminal to check). Node.js includes `npm`
- git installed. Follow the instructions to [install git](https://git-scm.com/downloads)

#### Setup

###### Local environment configuration

The first step is to clone the repository and install the project dependencies for both server and client folders via a terminal interface by running the `npm install` in the proper folder:

Client:

```
cd heroku-mcp/project_1/client
npm install
npm run build
```

Server:

```
cd heroku-mcp/project_1/server
npm install
npm run build
```

The second step is to create a `.env` file in the client folder. Find the `.env.example` file, copy it and rename it to `.env`.

Client:

```
cd heroku-mcp/project_1/client
cp .env.example .env
```

Edit the newly created `.env` file and update the variable with your Anthropic account API key information:

```
ANTHROPIC_API_KEY=
ANTHROPIC_CLAUDE_MODEL=claude-3-7-sonnet-20250219
```

> The ANTHROPIC_CLAUDE_MODEL=claude-3-7-sonnet-20250219 value is already set, to the Claude 3.5 model, but you are welcome to change it.

Once all of this is done, you are ready to run the application locally!

##### Development

To run the application locally, use the command line, navigate to the `client` folder, ensure the dependencies are installed properly, and run the following:

```
cd heroku-mcp/project_1/client
npm run dev
```

This will automatically run the Node script and you will be able to write prompts directly in your Command Line Interface.

When you make changes to your code, the server will automatically restart to fetch new changes.

## Project 2: Local MCP Client and Heroku MCP Server

![](./screenshots/project-2-architecture-diagram.png)

This project showcases how to run a local CLI tool with local MCP Clients that connect to an MCP server hosted on Heroku that was built with Node.js, TypeScript, and the Anthropic SDK. The architecture involves a two MCP clients that communicate with with their respective MCP servers over `streamable HTTP` and `SSE (server sent events)`:

The architecture diagram shows the following:

1.  **CLI Invocation**: The process starts when a user invokes a command through the **Command-Line Interface (CLI)**.
2.  **MCP Client**: The CLI interacts with an **MCP Clients** to gather context from various MCP servers both over `streamable HTTP` and `SSE (server sent events)`.
3.  **Streamable HTTP MCP Server Capabilities**: The MCP Server is configured with the following capabilities:
    - **Invokes weather API tools**: Lists two weather API [tools](./project_2/server/src/utils/UnifiedMCPServer.ts#25) for United States
4.  **Server Sent Events MCP Server Capabilities**: The MCP Server is configured with the following capabilities:
    - **Local file**: Gathers local file data ([data.json](./project_2/server/src/data/data.json))
    - **Invokes weather API tools**: Lists API weather tools just for Canada [tools](./project_2/server/src/utils/UnifiedMCPServer.ts#161)
    - **Prompt**: Sets a system [prompt](./project_2/server/src/utils/UnifiedMCPServer.ts#210)
5.  **Context Provisioning**: The MCP Client takes the payload from the MCP servers and passes it to the LLM as context.
6.  **LLM Processing**: The LLM (invoked via the [Anthropic SDK](./project_2/client/src/index.ts)) processes the user's request using the context provided by the MCP Client and decides which resource to invoke.
7.  **CLI Output**: The LLM's response is returned to the CLI, which then displays the final output to the user.

This setup demonstrates how a single host application can instantiate multiple MCP clients and connect to multiple MCP servers that are hosted on Heroku.

### Technologies used

**Client**

- [Node.js](https://nodejs.org/en)
- [TypeScript](https://www.typescriptlang.org/)
- [Express](https://expressjs.com/)
- [Anthropic TypeScript API Library](https://github.com/anthropics/anthropic-sdk-typescript)
- [Model Context Protocol](https://github.com/modelcontextprotocol/typescript-sdk)

**Server**

- [Node.js](https://nodejs.org/en)
- [TypeScript](https://www.typescriptlang.org/)
- [Express](https://expressjs.com/)
- [Model Context Protocol](https://github.com/modelcontextprotocol/typescript-sdk)
- [Heroku](https://www.heroku.com/)

### Configuration

#### Requirements

To run this application locally, you will need the following:

- An Anthropic [account](https://www.anthropic.com/) with a paid subscription to get an API key
- Node.js version 20 or later installed (type `node -v` in your terminal to check). Follow [instructions](https://nodejs.org/en/download) if you don't have node installed
- npm version 10.0.0 or later installed (type `npm -v` in your terminal to check). Node.js includes `npm`
- git installed. Follow the instructions to [install git](https://git-scm.com/downloads)
- A [Heroku account](https://signup.heroku.com/)
- A [WeatherAPI account](https://www.weatherapi.com/) and API key

#### Setup

###### Local environment configuration

The first step is to clone the repository and install the project dependencies for both server and client folders via a terminal interface by running the `npm install` in the proper folder:

Client:

```
cd heroku-mcp/project_2/client
npm install
npm run build
```

Server:

```
cd heroku-mcp/project_2/server
npm install
npm run build
```

The second step is to create a `.env` file in the client folder. Find the `.env.example` file, copy it and rename it to `.env`.

Client:

```
cd heroku-mcp/project_2/client
cp .env.example .env
```

Edit the newly created `.env` file and update the variable with your Anthropic account API key information:

```
ANTHROPIC_API_KEY=
ANTHROPIC_CLAUDE_MODEL=claude-3-7-sonnet-20250219
```

> The ANTHROPIC_CLAUDE_MODEL=claude-3-7-sonnet-20250219 value is already set, to the Claude 3.5 model, but you are welcome to change it.

Server:

```
cd heroku-mcp/project_2/server
cp .env.example .env
```

Edit the newly created `.env` file and update the variable with your WeatherAPI account API key:

```
WEATHER_USER_AGENT=weather-app/1.0
USA_WEATHER_API=https://api.weather.gov
WEATHERAPI_URL=https://api.weatherapi.com
WEATHERAPI_KEY=
```

Once all of this is done, you are ready to run the application locally!

##### Development

To run the application locally, use the command line, navigate to the `client` folder, ensure the dependencies are installed properly, and run the following:

```
cd heroku-mcp/project_2/client
npm run dev
```

This will automatically run the Node script and you will be able to write prompts directly in your Command Line Interface.

When you make changes to your code, the server will automatically restart to fetch new changes.

#### Deployment

Once you are happy with your application, you can deploy it to Heroku!

To deploy the application to Heroku, please follow the [official instructions](https://devcenter.heroku.com/articles/git).

> NOTE: If you want to deploy this application to Heroku, you will have to create all of the above variables as Heroku environment variables. This can be done via the [command line or the Heroku Dashboard UI](https://devcenter.heroku.com/articles/config-vars).

In order to deploy this on Heroku, make sure you have the right `package.json` deployment script in the repository root folder:

```
{
  "scripts": {
    "start": "cd project_2/server && npm install && npm run start"
  }
}

```

## Project 3: Agentforce and Heroku MCP Server integration (pre-native Agentforce MCP client)

![](./screenshots/project-3-architecture-diagram.png)

This project showcases how to integrate Salesforce Agentforce Agent with an MCP server via Heroku. The Heroku dyno hosts a Node Express server that exposes several routes that instantiate an MCP client and MCP server.

The architecture diagram shows the following:

1.  **Agentforce**: The process starts within **Agentforce**. An Agent invokes a Topic that invokes the appropriate Action that is defined by the OpenAPI specifications and it makes a network request to the Heroku Dyno.
2.  **Heroku**: The Heroku Dyno has a Node Express server running and a the incoming request is handled by the invoked endpoint
3.  **Express endpoint**: Once the invoked endpoint has received a network request, it will instantiate an MCP client and MCP server
4.  **MCP Client**: The MCP Client will invoke a specific tool from the MCP Server
5.  **MCP Server**: The MCP Server will utilize the tool and make the network API call to get weather data
6.  **Express server**: The server parses the MCP Server response and pushes the data back to Agentforce in a format defined by the OpenAPI specifications
7.  **Agentforce**: Agentforce gets the response and presents the data to the user

This setup demonstrates how to integrate Agentforce with an MCP server(s) via Heroku.

> Note: It is worth mentioning that this setup lacks the flexibility and most of the benefits the MCP standard provides. Unless MCP is a hard requirement, it would make a lot more sense to skip the MCP integration and go directly with API integrations.

### Technologies used

- [Node.js](https://nodejs.org/en)
- [TypeScript](https://www.typescriptlang.org/)
- [Express](https://expressjs.com/)
- [Model Context Protocol](https://github.com/modelcontextprotocol/typescript-sdk)
- [Heroku](https://www.heroku.com/)
- [Salesforce](https://www.salesforce.com)
- [Agentforce](https://www.salesforce.com/agentforce/)

### Configuration

#### Requirements

To run this application locally, you will need the following:

- Node.js version 20 or later installed (type `node -v` in your terminal to check). Follow [instructions](https://nodejs.org/en/download) if you don't have node installed
- npm version 10.0.0 or later installed (type `npm -v` in your terminal to check). Node.js includes `npm`
- git installed. Follow the instructions to [install git](https://git-scm.com/downloads)
- A [Heroku account](https://signup.heroku.com/)
- A [WeatherAPI account](https://www.weatherapi.com/) and API key
- A [Salesforce](https://www.salesforce.com) account enabled with [Agentforce](https://www.salesforce.com/agentforce/)

#### Setup

###### Local environment configuration

The first step is to clone the repository and install the project dependencies for the server folder via a terminal interface by running the `npm install` in the proper folder:

Server:

```
cd heroku-mcp/project_3/server
npm install
npm run build
```

The second step is to create a `.env` file in the server folder. Find the `.env.example` file, copy it and rename it to `.env`.

```
cd heroku-mcp/project_3/server
cp .env.example .env
```

Edit the newly created `.env` file and update the variable with your Anthropic account API key information:

```
CLIENT_ACCESS_TOKEN=example-token
WEATHER_USER_AGENT=weather-app/1.0
USA_WEATHER_API=https://api.weather.gov
WEATHERAPI_URL=https://api.weatherapi.com
WEATHERAPI_KEY=
```

Once all of this is done, you are ready to run the application locally by typing `npm run dev`!

##### Development

To run the application locally, use the command line, navigate to the `client` folder, ensure the dependencies are installed properly, and run the following:

```
cd heroku-mcp/project_2/client
npm run dev
```

This will automatically run the Node script and you will be able to write prompts directly in your Command Line Interface.

When you make changes to your code, the server will automatically restart to fetch new changes.

#### Deployment

Once you are happy with your application, you can deploy it to Heroku!

To deploy the application to Heroku, please follow the [official instructions](https://devcenter.heroku.com/articles/git).

> NOTE: If you want to deploy this application to Heroku, you will have to create all of the above variables as Heroku environment variables. This can be done via the [command line or the Heroku Dashboard UI](https://devcenter.heroku.com/articles/config-vars).

In order to deploy this on Heroku, make sure you have the right `package.json` deployment script in the repository root folder:

```
{
  "scripts": {
    "start": "cd project_3/server && npm install && npm run build && npm run start"
  }
}
```

### Salesforce configuration

1. In the Salesforce setup, navigate to `Named Credentials`, click on `External Credential` and create a new External Credential
2. In the Salesforce setup, navigate to `Named Credentials` and create a new Named Credential that points to your deployed Heroku instance and select the previously created External Credential
3. In Salesforce setup, navigate to `External Services` and create a new External Service via the [openAPI specification](./project_3/openapi.json) and point to the Named Credential you have created in the previous step
4. Go to `Agentforce Assets` and create new Actions for every individual route of the External Service you have just created
5. Navigate to the Agent of choice and create a new weather Topic and attach the newly created Actions

That is it! Now you can try out your new Actions with Agentforce!

## Project 4: Agentforce and Heroku MCP Server (native Agentforce MCP client)

🚧 **Work in progress** 🚧

At the time of creating this repository, the native Agentforce MCP client was not globally available.

# License

[MIT](http://www.opensource.org/licenses/mit-license.html)

# Disclaimer

This software is to be considered "sample code", a Type B Deliverable, and is delivered "as-is" to the user. Salesforce bears no responsibility to support the use or implementation of this software.
