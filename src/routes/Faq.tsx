import React, { ReactElement } from 'react'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'

function Faq(): ReactElement {
  return (
    <div className="faq-page">
      <Helmet>
        <title>{BASE_SITE_PAGE_TITLE} FAQ</title>
        <meta name="description" content="" />
      </Helmet>

      <section className="heroine heroine--normal">
        <h2>FAQ</h2>
          <h4>What is Midst?</h4>
          <p>Midst is a digital literary journal that publishes poems in the form of interactive timelapses. Readers will see the finished poem by default, but then they’ll be able to “rewind” it and see exactly how it was written, from the blank page to the final draft, including the entire revision process.</p>
          <h4>When?</h4>
          <p>Very soon! Hop on <a href="/">our mailing list</a> and we’ll update you.</p>
          <h4>Why does Midst matter?</h4>
          <p>We hope Midst will make poetry more accessible for everyone. By seeing how a poem is made, readers can understand that writing and editing are parallel processes; that writing is often nonlinear; that making poems is not a matter of intentionally obfuscating or ‘dressing up’ simple ideas in fancy/symbolic language; that poems do not emerge fully-formed and perfect from a writer’s mind, but are crafted through the act of writing itself. We hold no particular aesthetic allegiance, but we believe that poetry is a process, a way of thinking in language, engaging with language, attending to language. Poems are events. Poems are for everyone. Though Midst is intended to be an educational resource for poetry, there is no right or wrong way to make a poem; we’re excited about Midst’s potential to showcase some of the ways writers are going about it.</p>
          <h4>Who is Midst for?</h4>
          <p>– People who love poetry;<br />
          – People who just “don’t get” poetry;<br />
          – Aspiring poets who want to learn from some of the most exciting contemporary poets;<br />
          – Educators who want real-world examples of craft and revision to share with their students;<br />
          – Poets who want a better understanding of their own writing process;<br />
          – Scholars researching digital humanities and the archive;<br />
          – Anyone who’s ever wondered how technology is impacting how we write and how we think (writing is, after all, a form of thinking).</p>
          <h4>How do I participate as a writer?</h4>
          <p>The first issue of Midst is invitation-only; public nominations are now open <a href="http://www.midst.press/nominate">here</a>. You can nominate any living poet writing in the English language, and we encourage you to dream big! We’re especially excited about poets who already typically write from start-to-finish using a computer, but this isn’t a requirement.</p>
          <h4>How do I participate as a reader?</h4>
          <p>Nominate a poet (see above)! You can also sign up at <a href="http://www.tinyletter.com/midst">tinyletter.com/Midst</a> and we’ll keep you posted.</p>
          <h4>Who do I contact?</h4>
          <p>Annelyse Gelman, founder/director, at midsthq [@] gmail.</p>
        </section>
    </div>
  )
}

export default Faq
