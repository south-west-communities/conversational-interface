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
      agent.add(`I picked up a date period.`);
    } else {
      agent.add(`I didn't pick up a date. Try again.`);
    }
  }

  function eventByOrganiserAndDate(agent) {
    // TODO - Figure out why agent.context.set() / get() are not working
    let thisContext = request.body.queryResult.outputContexts[0];
    console.log(thisContext);
    let org = '';
    let date = '';

    // Check to see if there are values in context or agent
    if (agent.parameters.community) {
      org = agent.parameters.community;
    } else {
      org = null;
    }

    if (thisContext.parameters.date && thisContext.parameters.date.length > 1) {
      date = thisContext.parameters.date;
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
          const output = nextEventResponse(evnt, org);
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
    } else {
      agent.add(`I didn't pick up any data. Something must have gone wrong.`);
      agent.add(happyPathResponse());
    }
  }

  function specificCommunityHandler(agent) {
    agent.add(`Brilliant. Which community are you interested in?`);
  }

  // match function handler to the intent name
  let intentMap = new Map();
  intentMap.set('NextEvent', nextEventHandler);
  intentMap.set('NextCalendarEvent', nextCalendarEventHandler);
  intentMap.set('SpecificCommunity', specificCommunityHandler);
  intentMap.set('AroundDate', aroundDateHandler);
  intentMap.set('AroundDate - MoreInfo - Yes', eventByOrganiserAndDate);
  agent.handleRequest(intentMap);
});

function callEventApi(type, data){
  return new Promise((resolve, reject) => {
    let path = ``;
    if (type === 'calendar'){
      path = `${baseApiUrl}/${nextCalendarEventPath}`;
    } else if (type === 'date') {
      path = `${baseApiUrl}/${aroundDatePath}/${data}`;
    } else if (type === 'org-date') {
      path = `${baseApiUrl}/${dateAndOrgPath}/${data.org}/${data.date}`;
    } else {
      path = `${baseApiUrl}/${nextEventPath}/${data}`;
    }

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

function happyPathResponse(){
  return `I can look for another community or date, tell you the next event in our calendar or exit.`;
}

function nextEventResponse(evnt, orgName){
  if (orgName === null){
    return `The next event in the calendar is by ${evnt.organiserName} and is on ${humanDate(new Date(evnt.start))}. It's called ${evnt.title} and is hosted at ${evnt.venue} in ${evnt.geographic}.`;
  } else {
    return `The next ${orgName} event is on ${humanDate(new Date(evnt.start))}. It's called ${evnt.title} and is hosted at ${evnt.venue} in ${evnt.geographic}.`;
  }
}

function eventsOnDateResponse(results) {
  let utterance = `There are ${results.matches.length} events hosted by `;
  results.forEach(( evt, i ) => {
    utterance += i === results.matches.length - 1 ? 'and ' : '';
    utterance += evt.organiserName;
    utterance += i === results.matches.length - 1 ? '. ' : ', ';
  });
  return utterance;
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
