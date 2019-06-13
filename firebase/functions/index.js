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
  'plymouth web': '14338472',
  'kernow dat': '054497961539388',
  'cornwall geeks': '218412503144680',
  'software cornwall': '141228100812756',
  'cornwall tech jam': '271956584376238',
  'thinqtanq': '6377821409',
  'cornwall digital meetup': '1704124',
  'tech exeter': '1767306',
  'digital plymouth': '8225401568',
  'mesh': '11380604458',
  'future sync': '18225508719',
  'women in stem plymouth': '7944478778',
  'plymouth js': '16812344332',
  'digital exeter': '18581363',
  'sql south west': '21740803',
  'producttank exeter': '30492033',
  'digital taunton': '27349249',
  'exeter python': '20805314',
  'cornwall .net developers': '23670110',
  'data science cornwall': '29193006',
  'coderdojo cornwall': '29331508',
  'wordpress exeter': '20234010',
  'plymouth data meetup': '28243974',
  'algorithmic art': '22392802',
  'yena plymouth': '26687133',
  'prism exeter': '17763342041'
};
