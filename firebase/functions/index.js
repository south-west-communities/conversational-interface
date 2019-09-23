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
const aroundDatePath = '.netlify/functions/server/api/v1/aroundDate';
const dateAndOrgPath = '.netlify/functions/server/api/v1/eventByOrganiserAndDate';
const dateRangePath = '.netlify/functions/server/api/v1/eventInDatePeriod';

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({request, response});

  function nextEventHandler(agent) {
    // get the community ID needed for the api
    const orgName = agent.parameters.community.toLowerCase();
    const orgId = communities[orgName];

    // return to prevent the function exiting before promises resolve
    return callEventApi('community', orgId).then((evnt) => {

      if (typeof evnt !== 'undefined') {
        const output = nextEventResponse(evnt, orgName);
        console.log('Success:', output);

        agent.add(output);
        agent.add(eventCard(evnt, output));
      } else {
        agent.add(`It doesn't look like we have an event listed for them.`);
      }
      agent.add(happyPathResponse());

    }).catch((error) => {
      console.error('Error:', error);
      agent.add('ERROR in next event handler: ', error);
    });
  }

  function nextCalendarEventHandler(agent) {
    return callEventApi('calendar', null).then((evnt) => {

      if (typeof evnt !== 'undefined') {
        const output = nextEventResponse(evnt, null);
        console.log('Success:', output);

        agent.add(output);
        agent.add(eventCard(evnt, output));
      } else {
        agent.add(`Hmmm. I didn't get anything back from the server.`);
      }
      agent.add(happyPathResponse());

    }).catch((error) => {
      console.error('Error:', error);
      agent.add('ERROR in next calendar event handler: ', error);
    });
  }

  function aroundDateHandler(agent) {
    if (agent.parameters.date) {
      return callEventApi('date', agent.parameters.date).then((results) => {

        if (results.matches.length > 0) {
          agent.add(eventsOnDateResponse(results.matches));
          agent.add('Would you like to find out more about one of them?');
          results.matches.forEach( evt => {
            agent.add(new Suggestion(evt.organiserName));
          });
        } else if (results.near.length > 0) {
          agent.add(eventsOnDateResponse(results.near));
          agent.add('Would you like to find out more about one of them?');
        }
      }).catch((error) => {
        console.error('Error:', error);
        agent.add('ERROR in around date handler: ', error);
      });
    } else if (agent.parameters['date-period']) {
      return callEventApi('date-period', agent.parameters['date-period']).then((results) => {

        if (results.length > 0) {
          agent.add(eventsOnDateResponse(results));
          agent.add('Would you like to find out more about one of them?');
          let names = extractUniqueNames(results);
          names.forEach( name => {
            agent.add(new Suggestion(name));
          });
        } else {
          agent.add(`Looks like we don't have any events in that time period.`);
          agent.add(happyPathResponse());
        }
      }).catch((error) => {
        console.error('Error:', error);
        agent.add('ERROR in around date handler: ', error);
      });
    } else {
      agent.add(`I didn't pick up a date. Try again.`);
    }
  }

  function eventByOrganiserAndDateHandler(agent) {
    // TODO - Figure out why agent.context.set() / get() are not working
    let thisContext = request.body.queryResult.outputContexts[0];
    console.log(thisContext);
    let org = '';
    let date = '';

    // Check to see if there are values in context or agent
    if (agent.parameters.community) {
      org = agent.parameters.community;
    } else if (thisContext.parameters.community && thisContext.parameters.community.length > 1){
      org = thisContext.parameters.community;
    } else {
      org = null;
    }

    if (thisContext.parameters.date && thisContext.parameters.date.length > 1) {
      date = thisContext.parameters.date;
    } else if (thisContext.parameters['date-period'].startDate && thisContext.parameters['date-period'].startDate.length > 1){
      date = thisContext.parameters['date-period'].startDate;
    } else {
      date = null;
    }

    console.log('Date: ', date);
    console.log('Org: ', org);

    if (date && org) {
      console.log(`Getting organiser and date event.`);
      const orgId = communities[org.toLowerCase()];
      return callEventApi('org-date', {
        'date': date,
        'org': orgId
      }).then((evnt) => {
        if (typeof evnt !== 'undefined') {
          const output = nextEventByOrgAndDate(evnt);
          console.log('Success: ', output);

          agent.add(output);
          agent.add(eventCard(evnt, output));

          // maybe offer more info about the community here?
          agent.add(happyPathResponse());
        } else {
          agent.add(`Hmm. I can't find that event`);
          agent.add(happyPathResponse());
        }

      }).catch((error) => {
        console.error('Error:', error);
        agent.add('ERROR in the by organiser and date handler: ', error);
      });
    } else if (org) {
      agent.add(`I picked up a community but no date.`);
      agent.add(happyPathResponse());
    } else if (date) {
      agent.add(`How did I know you'd say that?!?`);
      agent.add(`Which community would you like the event for?`);
    } else {
      agent.add(`I didn't pick up any data. Something must have gone wrong.`);
      agent.add(happyPathResponse());
    }
  }

  // Complete Community info handler. Requires some refactoring of supporting apps.
  function communityInfoHandler(agent) {
    agent.add(`The folks at ${agent.parameters.community} are awesome!`);
  }

  // TODO: Add events in specific location intent.
  // Requires adding of date to models throught the app chain.


  // match function handler to the intent name
  let intentMap = new Map();
  intentMap.set('NextEvent', nextEventHandler);
  intentMap.set('NextCalendarEvent', nextCalendarEventHandler);
  intentMap.set('AroundDate', aroundDateHandler);
  intentMap.set('AroundDate - MoreInfo - Yes', eventByOrganiserAndDateHandler);
  intentMap.set('MoreAboutCommunity', communityInfoHandler);
  agent.handleRequest(intentMap);
});

function callEventApi(type, data){
  return new Promise((resolve, reject) => {
    let path = generatePath(type, data);
    console.log('API Request: ', path);

    https.get(path, res => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        let response;
        try {
          response = JSON.parse(body);
        } catch (error) {
          response = body;
          console.log('ERROR: Parsing JSON');
        }

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
    text: `${output} Discover further details via South West Communities.`,
    buttonText: `More Info`,
    buttonUrl: `${evnt.url}`
  });
}

function generatePath(type, data) {
  if (type === 'calendar'){
    return `${baseApiUrl}/${nextCalendarEventPath}`;
  } else if (type === 'date') {
    return `${baseApiUrl}/${aroundDatePath}/${data}`;
  } else if (type === 'org-date') {
    return `${baseApiUrl}/${dateAndOrgPath}/${data.org}/${data.date}`;
  } else if (type  === 'date-period'){
    return `${baseApiUrl}/${dateRangePath}/${data.startDate}/${data.endDate}`;
  } else {
    return `${baseApiUrl}/${nextEventPath}/${data}`;
  }
}

function nextEventByOrgAndDate(evnt){
  return `The ${evnt.organiserName} on ${humanDate(new Date(evnt.start))} is called ${evnt.title}. It'll be hosted at ${evnt.venue} in ${evnt.geographic}.`;
}

function extractUniqueNames(results) {
  results = results.matches ? results.matches: results;
  let names = [];
  results.forEach(evt => {
    names.push(evt.organiserName);
  });
  return [...new Set(names)];
}

function eventsOnDateResponse(results) {
  let names = extractUniqueNames(results);
  results = results.matches ? results.matches: results;
  let utterance = `There are ${results.length} events hosted by `;

  names.forEach(( name, i ) => {
    utterance += i === names.length - 1 ? 'and ' : '';
    utterance += name;
    utterance += i === names.length - 1 ? '. ' : ', ';
  });
  return utterance;
}

function happyPathResponse(){
  const responses = [
    `I can look for another community or date, tell you the next event in our calendar or exit.`,
    `Can I tell you whats happening next for a community, if there is somthing on a specific date or exit.`,
    `Would you like to know more about a specific community, the next event in our calendar or close?`,
    `Is there a specific date or comunity you'd like to find out about, or shall I go ahead and exit?`
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

function nextEventResponse(evnt, orgName){
  const responses = {
    'noOrg': [
      `The next event in the calendar is by ${evnt.organiserName} and is on ${humanDate(new Date(evnt.start))}. It's called ${evnt.title} and is hosted at ${evnt.venue} in ${evnt.geographic}.`,
      `On the ${humanDate(new Date(evnt.start))}, ${evnt.organiserName} is hosting at event called ${evnt.title} in ${evnt.geographic}.`
    ],
    'orgPresent': [
      `The next ${orgName} event is on ${humanDate(new Date(evnt.start))}. It's called ${evnt.title} and is hosted at ${evnt.venue} in ${evnt.geographic}.`,
      `${orgName} are hosting ${evnt.title} on ${humanDate(new Date(evnt.start))}. It'll be at ${evnt.venue} in ${evnt.geographic}.`
    ]
  };

  if (orgName === null){
    return responses.noOrg[Math.floor(Math.random() * responses.noOrg.length)];
  } else {
    return responses.orgPresent[Math.floor(Math.random() * responses.orgPresent.length)];
  }
}

function humanDate(originalDate){

  const date = new Date(originalDate);
  const dayName = date.toLocaleDateString('en-UK', { weekday: 'long' });
  const monthNames = [ 'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December' ];

  return `${dayName} the ${addOrdinal(date)} ${monthNames[date.getMonth()]}`;
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
  'data south west': '21740803',
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
  'plymouth design forum': '21751176839',
  'prism exeter': '17763342041',
  'coders of newton abbot': '31382334',
  'dc 441392': '32602249',
  'exeter amazon alexa meetup': '32164885',
  'exeter city futures': '9802040321',
  'exeter dot net': '19485670',
  'exeter functional programmers': '18577020',
  'exeter network for art and creative technology': '32593015',
  'exeter raspberry jam': '30478960',
  'fab lab devon': '6722521537',
  'product tank exeter': '30492033',
  'propeller exmouth': '30511814',
  'south west internet of things network': '25373382021',
  'weston tech': '27271453'
};
