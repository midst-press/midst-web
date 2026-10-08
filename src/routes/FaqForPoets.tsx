import React, { ReactElement } from 'react'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'

function FaqForPoets(): ReactElement {
  return (
    <div className="faq-for-poets-page">
      <Helmet>
        <title>{BASE_SITE_PAGE_TITLE} FAQ for Poets</title>
        <meta name="description" content="" />
      </Helmet>

      <section className="heroine heroine--normal">
        <h2>FAQ for invited poets</h2>
        <h4>What is Midst?</h4>
        <p>Midst is a brand-new digital literary journal, launching in 2019, that publishes poems in the form of interactive timelapses. Readers will see the finished poem by default, but then they’ll be able to “rewind” it and see exactly how it was written, from the blank page to the final draft, including the entire revision process.</p>
        <p>We hope Midst will make poetry (and the process of writing it!) more accessible to everyone. By seeing how a poem is made, readers can understand that writing and editing are parallel processes; that writing is often nonlinear; that making poems is not a matter of intentionally obfuscating or ‘dressing up’ simple ideas in fancy/symbolic language; that poems do not emerge fully-formed and perfect from a writer’s mind, but are crafted through the act of writing itself.</p>
        <p>Midst holds no particular aesthetic allegiance. We believe that poetry is a way of thinking in language, engaging with language, attending to language. Poems are events. Poems are for everyone. Our goal is not to show “how to write a poem” or to imply there’s any right or wrong way to do it; we simply hope to showcase some of the ways writers are going about it.</p>
        <h4>How do I participate?</h4>
        <p>Contributors will write brand-new poems—at their own pace—in a custom-built desktop app (also called Midst!), which we’ll provide to you. You can use the Midst app just like any word processor (like Textedit, Microsoft Word, or Google Docs). It looks like this:</p>
        <p style={{textAlign: 'center'}}>
          <img className="alignnone size-medium wp-image-70" style={{border: '5px solid red'}} src="http://midst-journal:8888/wp-content/uploads/2019/04/redwheelbarrow-768x480.png" alt="" width="600" />
        </p>
        <p>Behind the scenes, the app securely, privately saves the document’s editing history; this allows us to build the <a href="http://www.midst.press/read">interactive timelines</a> that will appear in the journal, and which allow the reader (or you!) to “rewind” the poem’s process:</p>
        <p style={{textAlign: 'center'}}>
          <img className="alignnone size-medium wp-image-71" style={{border: '5px solid purple'}} src="http://midst-journal:8888/wp-content/uploads/2019/04/bluewheelbarrow-768x480.png" alt="" width="600" />
        </p>
        <p>While you are participating in the project, you’ll be asked to write as often as possible in the Midst app. This will allow you to get used to the app, and ensures that the entire writing process is captured, start to finish. You writing will never be shared without your permission!</p>
        <p>Poems are saved in a special file format called Midst documents, with a .midst extension (instead of .doc or .rtf or .txt, etc.). You can save a .midst and then open it up again to keep writing/editing, as many times as you want.</p>
        <p>When you’re ready, you can email your finished .midst file(s) to Annelyse at annelysegelman@gmail.com. We’d love to receive 1-5 poems from you; send whatever you are comfortable with!</p>
        <h4>When’s the deadline?</h4>
        <p>There’s no strict deadline. You can spend as much time with the app as you like, until you are ready to send us your poem(s). We know that sometimes finishing a poem takes a week, and other times it takes months, and that it may be quite a while before you really have something you’re satisfied with. That’s totally fine! We only ask that, during your participation, you write as much as you can in the app, so that the entire process is captured, start to finish.</p>
        <h4>Cool, I want to participate! What now?</h4>
        <p>Yay! Just let Annelyse know, and she’ll send you the app. We look forward to sharing your work in the Midst journal (which should be launched sometime in 2019, depending on when the poets send in their work). We’re not interested in “directing,” editing, or altering your writing in any way; if you’ve been invited to participate, that means we are very excited about your writing, and we’d be happy to publish any work that you create with the Midst app that meets your own standards. We trust you, and we want this to be a platform for your poetry and your process, whatever that means for you.</p>
        <p>By the way: Consent is important for everyone’s wellbeing, and real consent is ongoing and enthusiastic! If you <i>ever</i> change your mind about participating in Midst, you can <i>always</i> revoke your consent: there is zero pressure to continue using the app if you don’t like it, and zero pressure to send us a poem(s), even if you’ve used the app for months. This is an experiment for all of us; we hope you love it, but if you don’t, no sweat. That said, if you find any bugs in the app, think of any features you wish it had, or otherwise would like to give us feedback, email us anytime: annelysegelman@gmail.com.</p>
        <h4>What about my privacy?</h4>
        <p>The privacy and security of writers is extremely important to us. The Midst app saves the whole history of a document in its timeline, behind the scenes, but nothing you write in Midst is ever shared, uploaded, or distributed to anyone (including the Midst team) without your permission. Nobody will ever see the work you make in Midst unless you choose to email us the .midst file (just like no one will ever see a Word document you write unless you show them the .doc).</p>
        <p>Writers grant Midst first-time publication rights for the poem(s) they contribute, as well as rights to reproduce the poem online and/or in print. Copyright remains with you, the author, always.</p>
        <h4>Wouldn’t it be amazing to incorporate additional commentary on process/craft, too?</h4>
        <p>I’m so glad you asked—heck yes!</p>
        <p>Writers will have two options for supplementing their timelapse poems on the Midst website. If you want to incorporate audio, we’ll help you record your poem, and/or a “director’s cut” where, as your poem’s timeline plays, you can give a blow-by-blow and talk the viewer through your process. You can also simply write a short “craft essay” (formal or casual, long or short—whatever you like) discussing your process (in general, and/or for that particular poem). The process commentary is optional, but we know our readers would appreciate it!</p>
        <h4>How are the writers compensated?</h4>
        <p>We’re working hard on this! Although we can’t confirm at this time the amount that we will be able to offer, we are committed to paying every participating writer. In addition, we’ll also work hard to publicize your participation in this exciting experiment!</p>
        <h4>Can I nominate another poet?</h4>
        <p><a href="/nominate">Yes!</a></p>
        <h4>Who do I contact?</h4>
        <p>Annelyse Gelman is the founder and director of the project; you can reach her at annelysegelman@gmail.com.</p>
      </section>
    </div>
  )
}

export default FaqForPoets
