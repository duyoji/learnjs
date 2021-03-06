'use strict';

var learnjs = {
  poolId: 'ap-northeast-1:eadf6495-3cb0-4604-bf35-c0b6032e315b'
};
learnjs.EVENT_TYPE = {
  REMOVEING_VIEW: 'removingView'
};

learnjs.problems = [
  {
    description: 'What is truth?',
    code: 'function problem() { return __; }'
  },
  {
    description: 'Simple Math',
    code: 'function problem() { return 42 === 6 * __; }'
  },
];

learnjs.appOnReady = function() {
  window.onhashchange = function() {
    learnjs.showView(window.location.hash);
  };
  learnjs.showView(window.location.hash);
  learnjs.identity.done(learnjs.addProfileLink);
};

learnjs.addProfileLink = function(profile) {
  var link = learnjs.template('profile-link');
  link.find('a').text(profile.email);
  $('.signin-bar').prepend(link);
}

learnjs.template = function(name) {
  return $('.templates .' + name).clone();
}

learnjs.buildCorrectFlash = function(problemNum) {
  var correctFlash = learnjs.template('correct-flash');
  var link = correctFlash.find('a');
  if(problemNum < learnjs.problems.length) {
    var nextNum = problemNum + 1;
    link.attr('href', '#problem-' + nextNum);
  } else {
    link.attr('href', '/');
    link.text("You're Finished!");
  }

  return correctFlash;
};

learnjs.landingView = function() {
  return learnjs.template('landing-view');
};

learnjs.problemView = function(data) {
  var problemNumber = parseInt(data, 10);
  var view = learnjs.template('problem-view');
  var problemData = learnjs.problems[problemNumber-1];
  var resultFlash = view.find('.result');

  if (problemNumber < learnjs.problems.length) {
    var buttonItem = learnjs.template('skip-btn');
    var nextNum = problemNumber + 1;
    buttonItem.find('a').attr('href', '#problem-' + nextNum);
    $('.nav-list').append(buttonItem);
    view.bind(learnjs.EVENT_TYPE.REMOVEING_VIEW, function() {
      buttonItem.remove();
    });
  }

  var answer = view.find('.answer');
  learnjs.fetchAnswer(problemNumber).then(function(data) {
    if(data.Item) {
      answer.val(data.Item.answer);
    }
  });

  function checkAnswer() {
    var test = problemData.code.replace('__', answer.val()) + '; problem();';
    return eval(test);
  }

  function checkAnswerClick() {
    if(checkAnswer()) {
      var flashContent = learnjs.buildCorrectFlash(problemNumber);
      learnjs.flashElement(resultFlash, flashContent);
      learnjs.saveAnswer(problemNumber, answer.val());
    } else {
      learnjs.flashElement(resultFlash, 'Incorrect!');
    }

    return false;
  }

  view.find('.check-btn').click(checkAnswerClick);
  view.find('.title').text('Problem #' + problemNumber);
  learnjs.applyObject(problemData, view);
  return view;
};

learnjs.profileView = function() {
  var view = learnjs.template('profile-view');
  learnjs.identity.done(function(identity) {
    view.find('.email').text(identity.email);
  });
  return view;
};

learnjs.showView = function(hash) {
  var routes = {
    '#problem': learnjs.problemView,
    '#profile': learnjs.profileView,
    '#': learnjs.landingView,
    '': learnjs.landingView,
  };
  var hashParts = hash.split('-');
  var viewFn = routes[hashParts[0]];
  if(viewFn) {
    learnjs.triggerEvent(learnjs.EVENT_TYPE.REMOVEING_VIEW, []);
    $('.view-container').empty().append(viewFn(hashParts[1]));
  }
};

learnjs.applyObject = function(obj, elem) {
  for (var key in obj) {
    elem.find('[data-name="' + key + '"]').text(obj[key]);
  }
};

learnjs.flashElement = function(elem, content) {
  elem.fadeOut('fast', function() {
    elem.html(content);
    elem.fadeIn();
  });
};

learnjs.triggerEvent = function(name, args) {
  $('.view-container > *').trigger(name, args);
};

learnjs.awsRefresh = function() {
  var deferred = new $.Deferred();
  AWS.config.credentials.refresh(function(err) {
    if(err) {
      deferred.reject(err);
    } else {
      deferred.resolve(AWS.config.credentials.identityId);
    }
  });
  return deferred.promise();
};

learnjs.identity = new $.Deferred();

learnjs.sendDbRequest = function(req, retry) {
  var promise = new $.Deferred();
  req.on('error', function() {
    if(error.code === 'CredentialsError') {
      learnjs.identity.then(function(identity) {
        return identity.refresh().then(function() {
          return retry();
        }, function() {
          // promise.reject(resp);
          promise.reject(error);
        });
      });
    } else {
      promise.reject(error);
    }
  });

  req.on('success', function(resp) {
    promise.resolve(resp.data);
  });
  req.send();
  return promise;
};

learnjs.saveAnswer = function(problemId, answer) {
  return learnjs.identity.then(function(identity) {
    var db = new AWS.DynamoDB.DocumentClient();
    var item = {
      TableName: 'learnjs',
      Item: {
        userId: identity.id,
        problemId: problemId,
        answer: answer
      }
    };
    return learnjs.sendDbRequest(db.put(item), function() {
      return learnjs.saveAnswer(problemId, answer);
    });
  });
}

learnjs.fetchAnswer = function(problemId) {
  return learnjs.identity.then(function(identity) {
    var db = new AWS.DynamoDB.DocumentClient();
    var item = {
      TableName: 'learnjs',
      Key: {
        userId: identity.id,
        problemId: problemId
      }
    };
    return learnjs.sendDbRequest(db.get(item), function() {
      learnjs.fetchAnswer(problemId);
    });
  });
};

/*********************************
 * public function (no namespace)
 *********************************/
function googleSignin(googleUser) {
  var id_token = googleUser.getAuthResponse().id_token;
  AWS.config.update({
    region: 'ap-northeast-1',
    credentials: new AWS.CognitoIdentityCredentials({
      IdentityPoolId: learnjs.poolId,
      Logins: {
        'accounts.google.com': id_token
      }
    })
  });

  learnjs.awsRefresh().then(function(id) {
    learnjs.identity.resolve({
      id: id,
      email: googleUser.getBasicProfile().getEmail(),
      refresh: refresh
    });
  });

  function refresh() {
    return gapi.auth2.getAuthInstance().signIn({
      prompt: 'login'
    }).then(function(userUpdate) {
      var creds = AWS.config.credentials;
      var newToken = userUpdate.getAuthResponse().id_token;
      creds.params.Logins['accounts.google.com'] = newToken;
      // return learnjs.awsRefresh();
    });
  }
}
