const WebSocket = require('ws');
const fs = require('fs');
const Innertube = require('youtubei.js');
const makeDir = require('make-dir');
const xdg = require('@folder/xdg');

function newMessage(topic, payload) {
  const message = { topic };
  message.payload = payload;

  return message;
}

async function start() {
  const dirs = xdg();
  const path = await makeDir(`${dirs.config}/cathode-tube.walking-octopus/`);
  const credsPath = `${path}/yt_oauth_creds.json`;

  let creds = (fs.existsSync(credsPath) && JSON.parse(fs.readFileSync(credsPath).toString())) || {};
  const youtube = await new Innertube();
  const wss = new WebSocket.Server({ port: 8999 });

  console.log('Listening on port 8999...');

  wss.on('connection', async (ws) => {
    // Create a new session only on first client
    if (wss.clients.size <= 1) {
      youtube.ev.on('auth', (data) => {
        switch (data.status) {
          case 'AUTHORIZATION_PENDING': {
            console.log(
              `On your phone or computer, go to ${data.verification_url} and enter the code ${data.code}`,
            );

            ws.send(JSON.stringify(
              newMessage('signIn', {
                url: data.verification_url,
                code: data.code,
              }),
            ));
            break;
          }
          case 'SUCCESS': {
            fs.writeFileSync(credsPath, JSON.stringify(data.credentials));
            console.log('Successfully signed-in, enjoy!');
            // ws.send(JSON.stringify(
            //   newMessage('updateStatus', 'Done'),
            // ));
            break;
          }
          default: console.error('Unhandled auth data: ', data.status);
        }
      });

      youtube.ev.on('update-credentials', (data) => {
        fs.writeFileSync(credsPath, JSON.stringify(data.credentials));
        console.log('Credentials updated!', data);
        // ws.send(JSON.stringify(
        //   newMessage('updateStatus', 'Done'),
        // ));
      });

      await youtube.signIn(creds);
      ws.send(JSON.stringify(
        newMessage('signedIn', 'Done'),
      ));
    }

    // FIXME: This assumes the feed is always loaded first and uses a global varriable
    // I think there is a better way
    let lastFeed;

    ws.on('message', async (data) => {
      const json = JSON.parse(data);

      switch (json.topic) {
        case 'GetFeed': {
          const homefeed = await youtube.getHomeFeed();
          ws.send(JSON.stringify(
            newMessage('updateFeed', homefeed),
          ));

          lastFeed = homefeed;

          break;
        }

        case 'GetContinuation': {
          if (lastFeed == null) {
            ws.send(JSON.stringify(
              newMessage('error', new Error('No feed').message),
            ));
            return;
          }

          const continuation = await lastFeed.getContinuation();
          ws.send(JSON.stringify(
            newMessage('updateContinuation', continuation),
          ));

          lastFeed = continuation;

          break;
        }

        default:
          ws.send(JSON.stringify(
            newMessage('error', new Error('Wrong query').message),
          ));
      }
    });
  });
}

start();

// Topic: GetFeed
// Payload:
//
// Topic: SignIn
// Payload: "XGA-DA"
