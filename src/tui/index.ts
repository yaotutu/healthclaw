import WebSocket from 'ws';
import { TUI, Text, Editor, ProcessTerminal, Container } from '@mariozechner/pi-tui';
import chalk from 'chalk';

const WS_URL = process.env.WS_URL || 'ws://localhost:3001/ws';
const sessionId = `tui-${Date.now()}`;

// 连接 WebSocket
const ws = new WebSocket(WS_URL);

// 创建终端和 TUI
const terminal = new ProcessTerminal();
const tui = new TUI(terminal);

// 消息容器
const messageContainer = new Container();

// 处理 WebSocket 消息
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  switch (msg.type) {
    case 'event':
      if (msg.event?.type === 'message_update') {
        const content = msg.event.message?.content || '';
        // 找到最后一个 assistant 消息并更新
        const children = messageContainer.children;
        const lastChild = children[children.length - 1];
        if (lastChild && (lastChild as any)._role === 'assistant') {
          // 更新现有消息
          const textComponent = lastChild as Text;
          textComponent.setText(`${chalk.green('HealthClaw:')} ${content}`);
        } else {
          // 添加新消息
          const text = new Text(`${chalk.green('HealthClaw:')} ${content}`, 1, 1);
          (text as any)._role = 'assistant';
          messageContainer.addChild(text);
        }
        tui.requestRender();
      }
      break;

    case 'done':
      // 消息完成
      break;

    case 'error':
      messageContainer.addChild(new Text(chalk.red(`Error: ${msg.error}`), 1, 1));
      tui.requestRender();
      break;
  }
});

ws.on('open', () => {
  // 创建输入编辑器
  const editor = new Editor(tui, {
    borderColor: (s) => chalk.gray(s),
    selectList: {
      selectedPrefix: (s) => chalk.cyan(s),
      selectedText: (s) => chalk.white(s),
      description: (s) => chalk.gray(s),
      scrollInfo: (s) => chalk.gray(s),
      noMatch: (s) => chalk.red(s),
    },
  });

  editor.onSubmit = (text) => {
    if (!text.trim()) return;

    // 添加用户消息到容器
    const userText = new Text(`${chalk.blue('You:')} ${text}`, 1, 1);
    (userText as any)._role = 'user';
    messageContainer.addChild(userText);
    tui.requestRender();

    // 发送给服务器
    ws.send(JSON.stringify({
      type: 'prompt',
      content: text,
      sessionId,
    }));

    // 清空输入并刷新
    editor.setText('');
    tui.requestRender();
  };

  // 添加标题和说明
  tui.addChild(new Text(chalk.cyan('HealthClaw TUI - Connected to server'), 1, 1));
  tui.addChild(new Text(chalk.gray('Type your message and press Enter to send. Ctrl+C to exit.'), 1, 1));

  // 添加消息容器
  tui.addChild(messageContainer);

  // 添加编辑器
  tui.addChild(editor);

  tui.start();
});

ws.on('error', (err) => {
  console.error(chalk.red(`WebSocket error: ${err.message}`));
  process.exit(1);
});

ws.on('close', () => {
  console.log(chalk.yellow('Connection closed'));
  process.exit(0);
});
