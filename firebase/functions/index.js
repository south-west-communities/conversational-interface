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
    agent.add('Let me have a look.');

    // get the community ID needed for the api
    const orgName = agent.parameters.community.toLowerCase();
    const orgId = communities[orgName];

    // retrun to prevent the function exiting before promises resolve
    return callEventApi(orgId, orgName).then((output) => {
      console.log('Success:', output);
      agent.add(output);
    }).catch((error) => {
      console.error('Error:', error);
      agent.add('ERROR in next event handler: ', error);
    });
  }

  // Run the proper function handler based on the matched intent name
  let intentMap = new Map();
  intentMap.set('NextEvent', nextEventHandler);
  agent.handleRequest(intentMap);
});

function callEventApi(orgId, orgName){
  return new Promise((resolve, reject) => {
    let path = `${baseApiUrl}/${nextEventPath}/${orgId}`;
    console.log('API Request: ', path);

    https.get(path, res => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        let response = JSON.parse(body);
        console.log('RESPONSE: ', response);

        let date = new Date();
        let output = `The next ${orgName} event is on ${humanDate(date)}.`;

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

function humanDate(originalDate){

  const date = new Date(originalDate);
  const monthNames = [
    'January', 'February', 'March',
    'April', 'May', 'June', 'July',
    'August', 'September', 'October',
    'November', 'December'
  ];

  const day = date.getDate();
  const monthIndex = date.getMonth();
  const dayName = date.toLocaleDateString('en-UK', { weekday: 'long' });

  return `${dayName} the ${addOrdinal(date)} ${monthNames[monthIndex]}`;
}

function addOrdinal(dt) {
  return dt.getDate()+(dt.getDate() % 10 === 1 && dt.getDate() !== 11 ? 'st' : (dt.getDate() % 10 === 2 && dt.getDate() !== 12 ? 'nd' : (dt.getDate() % 10 === 3 && dt.getDate() !== 13 ? 'rd' : 'th')));
}

const communities = {
  'plymouth web': '14338472'
};
