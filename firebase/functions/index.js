// https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// https://github.com/dialogflow/dialogflow-fulfillment-nodejs/tree/master/samples/actions-on-google
'use strict';

const functions = require('firebase-functions');
const { WebhookClient } = require('dialogflow-fulfillment');
// const { Card, Suggestion } = require('dialogflow-fulfillment');
const https = require('https');

// API Endpoints
const baseApiUrl = 'https://competent-kalam-703497.netlify.com';
const nextEventPath = '.netlify/functions/server/api/v1/nextEventByOrganiser';

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({request, response});

  function nextEventHandler(agent) {
    let errorMsg = 'The next event is next wednesday';
    agent.add('In the function.');

    return callEventApi('14338472').then((output) => {
      console.log('Success:', output);
      agent.add(output);
    }).catch((error) => {
      console.error('Error:', error);
      agent.add(errorMsg + '. ' + error);
    });
  }

  // Run the proper function handler based on the matched intent name
  let intentMap = new Map();
  intentMap.set('NextEvent', nextEventHandler);
  agent.handleRequest(intentMap);
});

function callEventApi(orgId){
  return new Promise((resolve, reject) => {
    let path = `${baseApiUrl}/${nextEventPath}/${orgId}`;
    console.log('API Request: ', path);

    https.get(path, res => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        let response = JSON.parse(body);
        console.log('RESPONSE: ', response);

        let community = orgId;
        let output = `The next ${community} event is on Wednesday. Fullfilment`;

        console.log(output);
        resolve(output);
      });
      res.on('error', (error) => {
        console.log(`Error calling the south west communities API: ${error}`);
        reject();
      });
    });
  });
}
