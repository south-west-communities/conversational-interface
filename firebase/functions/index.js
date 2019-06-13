/* jshint latedef:nofunc */
'use strict';

const functions = require('firebase-functions');
const { WebhookClient } = require('dialogflow-fulfillment');
const { Card, Suggestion } = require('dialogflow-fulfillment');
const https = require('https');

// API Endpoints
const baseApiUrl = 'https://competent-kalam-703497.netlify.com';
const nextEventPath = '.netlify/functions/server/api/v1/nextEventByOrganiser';
const nextCalendarEventPath = '.netlify/functions/server/api/v1/NextEvent';

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({request, response});

  function nextEventHandler(agent) {
    // agent.add('Let me have a look.');

    // get the community ID needed for the api
    const orgName = agent.parameters.community.toLowerCase();
    const orgId = communities[orgName];

    // return to prevent the function exiting before promises resolve
    return callEventApi(orgId).then((evnt) => {

      if (typeof evnt !== 'undefined') {
        const output = nextEventResponse(evnt, orgName);
        console.log('Success:', output);

        agent.add(output);
        agent.add(eventCard(evnt, output));
      } else {
        agent.add(`I didn't catch that. Can you say the community name again?`);
      }


      // TODO: Ask followup question
      // Further information / Another community / exit
    }).catch((error) => {
      console.error('Error:', error);
      agent.add('ERROR in next event handler: ', error);
    });
  }

  function nextCalendarEventHandler(agent) {
    return callEventApi(null).then((evnt) => {

      if (typeof evnt !== 'undefined') {
        const output = nextEventResponse(evnt, null);
        console.log('Success:', output);

        agent.add(output);
        agent.add(eventCard(evnt, output));
      } else {
        agent.add(`Hmmm. I didn't get anything back from the server.`);
      }


      // TODO: Ask followup question
      // Further information / Another community / exit ???
    }).catch((error) => {
      console.error('Error:', error);
      agent.add('ERROR in next event handler: ', error);
    });
  }

  // match function handler to the intent name
  let intentMap = new Map();
  intentMap.set('NextEvent', nextEventHandler);
  intentMap.set('NextCalendarEvent', nextCalendarEventHandler);
  agent.handleRequest(intentMap);
});

function callEventApi(orgId){
  return new Promise((resolve, reject) => {
    let path = ``;
    if (orgId === null){
      path = `${baseApiUrl}/${nextCalendarEventPath}`;
    } else {
      path = `${baseApiUrl}/${nextEventPath}/${orgId}`;
    }

    console.log('API Request: ', path);

    https.get(path, res => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        // TODO: Handle orgs with no events

        let response = JSON.parse(body);
        console.log('RESPONSE: ', response);
        resolve(response.event);
      });
      res.on('error', (error) => {
        console.log(`Error calling the south west communities API: ${error}`);
        reject();
      });
    });
  });
}

function eventCard(evnt, output) {
  return new Card({
    title: `${evnt.title}`,
    imageUrl: `https://southwestcommunities.co.uk/${evnt.image}`,
    text: `${output} Discover further details via South West Communities. 💁`,
    buttonText: `More Info`,
    buttonUrl: generateURL(evnt)
  });
}

function generateURL(evt) {
  let fileTitle = evt.title.toLowerCase().replace(/\s+/g, '-');
  fileTitle = fileTitle.replace(/(\/)/g, '-');
  fileTitle = fileTitle.replace(/(\:)/g, '-');
  fileTitle = fileTitle.replace(/(\#)/g, '');
  fileTitle = fileTitle.replace(/(\")/g, '');
  fileTitle = fileTitle.replace(/(\')/g, '');
  fileTitle += '-';
  fileTitle += evt.id;

  return `https://southwestcommunities.co.uk/events/${fileTitle}`;
}

function nextEventResponse(evnt, orgName){
  if (orgName === null){
    return `The next event in the calendar is by ${evnt.organiserName} and is on
            ${humanDate(new Date(evnt.start))}. It's called ${evnt.title}`;
  } else {
    return `The next ${orgName} event is on ${humanDate(new Date(evnt.start))}.`;
  }
}

function humanDate(originalDate){

  const date = new Date(originalDate);
  const dayName = date.toLocaleDateString('en-UK', { weekday: 'long' });
  const monthNames = [
    'January', 'February', 'March',
    'April', 'May', 'June', 'July',
    'August', 'September', 'October',
    'November', 'December'
  ];

  return `${dayName} the ${addOrdinal(date)} ${monthNames[date.getMonth()]}`;
}

function addOrdinal(dt) {
  return dt.getDate()+(dt.getDate() % 10 === 1 && dt.getDate() !== 11 ? 'st' : (dt.getDate() % 10 === 2 && dt.getDate() !== 12 ? 'nd' : (dt.getDate() % 10 === 3 && dt.getDate() !== 13 ? 'rd' : 'th')));
}

// TODO: Add all the communities
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
