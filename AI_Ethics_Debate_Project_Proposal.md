# Final Project Proposal

## Project Title
Ethics Arena: A Multi-Agent AI Debate Chatroom for Moral and Ethical Dilemmas

## 1. Project Overview
This project proposes an interactive chatroom in which multiple AI agents debate moral and ethical questions from different philosophical or social perspectives. Each agent acts as a distinct "person" with a clear identity, debate style, and value system. A human user can join the discussion at any time through the chat interface, challenge arguments, ask follow-up questions, or introduce new evidence.

Unlike a standard chatbot, this system is designed to simulate structured disagreement. The AI agents do not merely answer the user; they respond to one another, defend their positions, critique opposing reasoning, and support claims with retrieved external materials such as research papers, analysis articles, public case studies, and selected multimedia references.

The system aims to explore whether AI can facilitate richer ethical discussion by presenting multiple perspectives rather than a single response.

## 2. Problem Statement
Most AI chat applications provide one synthesized answer, which can hide disagreement, uncertainty, and competing moral frameworks. Ethical questions rarely have one universally accepted solution. Topics such as privacy, punishment, free speech, euthanasia, autonomous weapons, AI bias, animal rights, and abortion are shaped by different value systems and conflicting priorities.

This project addresses that limitation by creating a multi-agent discussion environment where:

- multiple moral perspectives can be represented simultaneously;
- outside evidence can be retrieved to improve argument quality;
- the human user can participate in and steer the discussion;
- the final output includes not only opinions, but also sources, disagreements, and unresolved tensions.

## 3. Objectives
The main objectives of the project are:

- Build a chatroom-style application with multiple AI debate agents.
- Give each agent a stable role, ethical framework, and conversational style.
- Allow agents to retrieve and cite external evidence to support arguments.
- Allow the user to actively join the discussion instead of only observing it.
- Produce clear summaries of major arguments, agreements, disagreements, and open questions.
- Demonstrate a practical multi-agent AI system that is technically feasible within a final project scope.

## 4. Core Features

### 4.1 Multi-Agent Role Debate
Each AI participant will represent a different reasoning lens. Example roles may include:

- a utilitarian thinker focused on outcomes and aggregate welfare;
- a deontological thinker focused on duties, rights, and rules;
- a virtue ethics thinker focused on character and moral habits;
- a pragmatic policy analyst focused on real-world consequences and implementation;
- a moderator agent that keeps the discussion organized and safe.

### 4.2 Structured Debate Flow
To prevent the system from becoming chaotic or repetitive, the debate will follow a guided flow:

1. User submits a moral or ethical question.
2. Moderator reframes the topic and defines the key tension.
3. Debate agents provide opening statements.
4. A research step retrieves supporting or opposing evidence.
5. Agents rebut one another with explicit references to previous claims.
6. User joins with questions or counterarguments.
7. Moderator summarizes points of agreement, disagreement, and uncertainty.

### 4.3 Retrieval-Augmented Argumentation
Agents will be able to use external information, including:

- academic papers or abstracts;
- philosophy or law articles;
- public policy analyses;
- selected news or case studies;
- optionally video and image references as supporting material.

To keep evidence quality manageable, the system will prioritize high-credibility sources over loosely verified content.

### 4.4 User Participation
The user is not only a prompt author, but an active participant. The interface will support:

- asking follow-up questions;
- challenging an agent's assumptions;
- requesting more evidence;
- asking one agent to respond directly to another;
- switching the topic or changing the debate tone.

### 4.5 Debate Summary and Reflection
At the end of a session, the system should generate:

- a summary of each side's strongest arguments;
- a list of cited sources;
- major unresolved moral conflicts;
- a brief reflective conclusion from the moderator or judge agent.

## 5. Feasibility Analysis
This project is feasible if implemented in layers.

### 5.1 Why It Is Feasible
- Multi-agent orchestration can be implemented with one LLM backend and carefully designed prompts.
- Web retrieval is a standard capability that can be integrated through search APIs.
- A chatroom interface is straightforward with modern web frameworks.
- The core academic value comes from orchestration, role control, and evidence use, not from building a new model.

### 5.2 Main Challenges
- Agents may sound too similar if the role definitions are weak.
- External retrieval may produce low-quality or misleading sources.
- Multi-turn debates can become repetitive without turn control.
- Costs and latency rise as the number of agents and tools increases.
- Some ethics topics require safety moderation to avoid harmful or extremist outputs.

### 5.3 Scope Control Strategy
To keep the project realistic, development should focus on an MVP first:

- 3 debate agents plus 1 moderator;
- text-first interface;
- article and paper retrieval before video/image retrieval;
- structured turn-taking;
- evidence cards with links and short summaries.

Video and image evidence can be treated as stretch goals rather than first-phase requirements.

## 6. Proposed Technical Architecture

### 6.1 High-Level Components
- Frontend chatroom UI
- Backend API and orchestration layer
- Debate agent layer
- Research and retrieval layer
- Session memory and storage layer
- Safety and moderation layer

### 6.2 Suggested Stack

#### Frontend
- Next.js or React
- Tailwind CSS or simple custom CSS
- Optional Socket.IO for real-time updates

#### Backend
- Next.js API routes or Node.js/Express
- OpenAI API for debate generation and summarization
- Search API such as Tavily, SerpAPI, or Bing Search API

#### Data and State
- SQLite for local persistence during development
- JSON-based session records for debate history, agent state, and citations

#### Optional Extensions
- Semantic Scholar or Crossref for paper metadata
- YouTube Data API for video references
- image search integration for visual evidence cards

### 6.3 Orchestration Design
The backend will act as an orchestrator:

- store the current topic and turn history;
- call a moderator prompt to decide the next speaker;
- call the research tool when evidence is needed;
- provide retrieved evidence to a selected agent;
- enforce reply length, citation format, and response order;
- generate final summaries and reflection.

### 6.4 Memory Design
The system should track:

- current debate topic;
- agent roles and stance definitions;
- previous arguments and rebuttals;
- cited sources already used;
- user interventions and follow-up questions.

## 7. Page and Feature Plan

### 7.1 Home / Topic Setup Page
Purpose:
- enter a debate topic;
- choose debate mode or topic category;
- optionally select participating agent roles;
- start a new session.

### 7.2 Debate Room Page
Purpose:
- display the live discussion between AI agents and the user;
- show clearly labeled agent messages;
- allow the user to type into the conversation;
- support buttons such as "request evidence", "ask for rebuttal", and "summarize now".

Key UI elements:
- topic header;
- participant sidebar;
- scrolling chat timeline;
- user input box;
- evidence panel or citation cards.

### 7.3 Source Detail Panel
Purpose:
- show retrieved article or paper cards;
- display title, source type, short summary, and link;
- indicate which agent used each source.

### 7.4 Summary Page or End-of-Session Panel
Purpose:
- show strongest arguments from each side;
- list source references;
- show major points of agreement and disagreement;
- optionally assign a debate quality or evidence score.

## 8. Development Milestones

### Milestone 1: Project Setup and Basic UI
- Initialize frontend and backend structure.
- Build topic input page and simple chatroom layout.
- Add placeholder agent personas.

### Milestone 2: Multi-Agent Debate Engine
- Implement moderator-driven turn order.
- Implement distinct prompts for each agent.
- Generate structured opening statements and rebuttals.

### Milestone 3: Retrieval Integration
- Add search API integration.
- Build evidence card data model.
- Inject retrieved evidence into agent responses.

### Milestone 4: User Participation and Session Memory
- Let the user interrupt or guide the discussion.
- Store session history and citation references.
- Improve continuity across multiple turns.

### Milestone 5: Safety, Summary, and Polish
- Add topic moderation and safer prompting rules.
- Add final summary generation.
- Improve UI clarity and presentation quality.

### Milestone 6: Testing and Demo Preparation
- Test multiple ethics topics.
- Compare behavior with and without retrieval.
- Prepare screenshots, diagrams, and demo scenarios.

## 9. Evaluation Plan
The project can be evaluated using:

- role distinctiveness: do agents consistently represent different moral frameworks;
- argument quality: are claims coherent, relevant, and responsive;
- evidence grounding: are sources real, cited clearly, and used appropriately;
- user experience: can a user meaningfully join and influence the discussion;
- system stability: does the debate remain organized across multiple turns.

Simple qualitative testing with several moral dilemmas will be enough for a final project, especially if supported by screenshots and example transcripts.

## 10. Expected Outcome
The final system should demonstrate that AI can be used not only to answer questions, but to stage structured ethical discussion among multiple perspectives. The expected deliverable is a working prototype that highlights:

- multi-agent orchestration;
- retrieval-augmented reasoning;
- interactive chat-based participation;
- explainable, source-supported debate output.

## 11. Conclusion
This project is ambitious but realistic if it is scoped carefully. The strongest version of the project is not the one with the most features, but the one that clearly demonstrates structured multi-agent reasoning, useful evidence retrieval, and an engaging user experience. A well-executed MVP with strong role design and reliable source handling would already make a compelling final project.
